import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
  UsePipes
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { QUEUE_NAMES } from '@lecture/contracts';
import { APP_ENV, AppEnv } from '@lecture/config';
import { ActiveJobExistsError } from '@lecture/pipeline';
import { Response } from 'express';
import { QueueService } from '../services/queue.service';
import { JobStoreService } from '../services/job-store.service';
import { CreateIngestionRequestSchema } from '../dto/create-ingestion-request.schema';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { GenerateFlashcardsRequestSchema } from '../dto/generate-flashcards-request.schema';
import { GenerateFlashcardsByJobRequestSchema } from '../dto/generate-flashcards-by-job-request.schema';

@Controller()
export class AppController {
  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly queueService: QueueService,
    private readonly store: JobStoreService
  ) {}

  @Get('/health')
  health() {
    return {
      status: 'ok',
      service: this.env.SERVICE_NAME,
      appEnv: this.env.APP_ENV,
      queuePrefix: this.env.REDIS_QUEUE_PREFIX,
      contractVersion: 'v1'
    };
  }

  @Get('/ready')
  ready() {
    return { status: 'ready', queues: QUEUE_NAMES };
  }

  @Post('/api/v1/lectures/ingest')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: Number(process.env.UPLOAD_MAX_FILE_SIZE_BYTES || 200 * 1024 * 1024)
      }
    })
  )
  @UsePipes(new ZodValidationPipe(CreateIngestionRequestSchema))
  async createIngestionJob(@Body() parsed: any, @UploadedFile() file?: { buffer: Buffer }) {
    const fileBase64 = file?.buffer?.toString('base64') ?? parsed.fileBase64;
    if (parsed.sourceType === 'upload' && !fileBase64) {
      throw new BadRequestException('file is required for upload sourceType');
    }
    if (parsed.sourceType === 'url' && !parsed.sourceUrl) {
      throw new BadRequestException('sourceUrl is required for url sourceType');
    }
    if (parsed.sourceType === 'upload') {
      this.assertSupportedUpload(parsed.filename, parsed.mimeType);
    }

    const activeJob = await this.store.repo.getActiveJob();
    if (activeJob) {
      throw new ConflictException(
        `Another lecture is still processing (jobId=${activeJob.jobId}, status=${activeJob.status}). Wait until it is COMPLETED or FAILED.`
      );
    }

    const lectureId = randomUUID();
    const jobId = randomUUID();

    try {
      await this.store.repo.createJob({
        jobId,
        lectureId,
        sourceType: parsed.sourceType,
        filename: parsed.filename,
        mimeType: parsed.mimeType,
        sourceUrl: parsed.sourceUrl,
        requestedLanguage: parsed.requestedLanguage ?? 'ru'
      });
    } catch (error) {
      if (error instanceof ActiveJobExistsError) {
        throw new ConflictException(
          'Another lecture is still processing. Wait until the active job is COMPLETED or FAILED.'
        );
      }
      throw error;
    }

    try {
      await this.queueService.enqueueIngestion({
        jobId,
        lectureId,
        sourceType: parsed.sourceType,
        sourceUrl: parsed.sourceUrl,
        filename: parsed.filename,
        mimeType: parsed.mimeType,
        requestedLanguage: parsed.requestedLanguage ?? 'ru',
        uploadedAt: new Date().toISOString(),
        fileBase64
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.store.repo.setError(jobId, 'INGESTION_ENQUEUE_ERROR', message);
      throw new ServiceUnavailableException('Queue is temporarily unavailable');
    }

    return {
      jobId,
      lectureId,
      status: 'QUEUED',
      queue: QUEUE_NAMES.ingestion
    };
  }

  private assertSupportedUpload(filename: string, mimeType?: string): void {
    const ext = path.extname(String(filename || '')).toLowerCase();
    const mime = String(mimeType || '').toLowerCase();
    const allowedMimePrefix = ['audio/', 'video/'];
    const allowedMimeSet = new Set([
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]);
    const allowedExt = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac', '.mp4', '.mov', '.mkv', '.webm', '.pdf', '.txt', '.pptx']);

    const mimeOk =
      mime.length === 0 ||
      allowedMimePrefix.some((prefix) => mime.startsWith(prefix)) ||
      allowedMimeSet.has(mime);
    const extOk = allowedExt.has(ext);

    if (!mimeOk && !extOk) {
      throw new BadRequestException(
        'Unsupported file type. Allowed: audio/video, PDF, TXT, PPTX'
      );
    }
  }

  private isAudioVideoJob(job: { filename?: string | null; storagePath?: string | null; mimeType?: string | null }): boolean {
    const mime = String(job.mimeType ?? '').toLowerCase();
    if (mime.startsWith('audio/') || mime.startsWith('video/')) {
      return true;
    }
    const allowedMediaExt = new Set([
      '.mp3',
      '.wav',
      '.m4a',
      '.ogg',
      '.aac',
      '.flac',
      '.mp4',
      '.mov',
      '.mkv',
      '.webm'
    ]);
    const filenameExt = path.extname(String(job.filename ?? '')).toLowerCase();
    const storageExt = path.extname(String(job.storagePath ?? '')).toLowerCase();
    return allowedMediaExt.has(filenameExt) || allowedMediaExt.has(storageExt);
  }

  @Get('/api/v1/jobs/:jobId')
  async getJob(@Param('jobId') jobId: string) {
    const job = await this.store.repo.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    return job;
  }

  @Get('/api/v1/jobs/:jobId/result')
  async getJobResult(@Param('jobId') jobId: string, @Res({ passthrough: true }) response: Response) {
    const job = await this.store.repo.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    if (job.status === 'FAILED') {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY);
      return {
        jobId,
        status: job.status,
        message: 'Job processing failed',
        errorCode: job.errorCode,
        errorMessage: job.errorMessage
      };
    }

    if (job.status !== 'COMPLETED') {
      response.status(HttpStatus.ACCEPTED);
      return {
        jobId,
        status: job.status,
        message: 'Result is not ready yet',
        progress: this.statusToProgress(job.status),
        recommendedPollIntervalMs: this.env.JOB_RESULT_POLL_INTERVAL_MS,
        expectedMaxProcessingMs: this.env.JOB_EXPECTED_MAX_PROCESSING_MS
      };
    }

    return {
      jobId: job.jobId,
      lectureId: job.lectureId,
      status: job.status,
      transcriptPath: job.transcriptPath,
      transcriptText: job.transcriptText,
      transcript: job.transcriptJson ? JSON.parse(job.transcriptJson) : null,
      highlightsPath: job.highlightsPath,
      highlights: job.highlightsJson ? JSON.parse(job.highlightsJson) : null,
      summaryPath: job.summaryPath,
      summary: job.summaryJson ? JSON.parse(job.summaryJson) : null,
      flashcardsPath: job.flashcardsPath,
      flashcards: job.flashcardsJson ? JSON.parse(job.flashcardsJson) : null
    };
  }

  @Get('/api/v1/jobs/:jobId/transcript')
  async getFullTranscript(@Param('jobId') jobId: string, @Res({ passthrough: true }) response: Response) {
    const job = await this.store.repo.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status === 'FAILED') {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY);
      return {
        jobId,
        status: job.status,
        message: 'Job processing failed',
        errorCode: job.errorCode,
        errorMessage: job.errorMessage
      };
    }
    if (!job.transcriptJson) {
      response.status(HttpStatus.ACCEPTED);
      return {
        jobId,
        status: job.status,
        message: 'Transcript is not ready yet'
      };
    }
    return {
      jobId,
      lectureId: job.lectureId,
      transcript: JSON.parse(job.transcriptJson)
    };
  }

  @Post('/api/v1/jobs/:jobId/highlights')
  async generateTranscriptHighlights(
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.requestHighlightsGeneration(jobId);
    response.status(HttpStatus.ACCEPTED);
    return result;
  }

  @Get('/api/v1/jobs/:jobId/highlights')
  async getTranscriptHighlights(
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const job = await this.store.repo.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status === 'FAILED') {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY);
      return {
        jobId,
        status: job.status,
        message: 'Job processing failed',
        errorCode: job.errorCode,
        errorMessage: job.errorMessage
      };
    }
    if (!job.highlightsJson) {
      response.status(HttpStatus.ACCEPTED);
      return {
        jobId,
        status: job.status,
        message: 'Transcript highlights are not ready yet'
      };
    }
    return {
      jobId,
      lectureId: job.lectureId,
      highlights: JSON.parse(job.highlightsJson)
    };
  }

  @Post('/api/v1/jobs/:jobId/summary')
  async generateLectureSummary(@Param('jobId') jobId: string, @Res({ passthrough: true }) response: Response) {
    const result = await this.requestSummaryGeneration(jobId);
    response.status(HttpStatus.ACCEPTED);
    return result;
  }

  @Get('/api/v1/jobs/:jobId/summary')
  async getLectureSummary(@Param('jobId') jobId: string, @Res({ passthrough: true }) response: Response) {
    const job = await this.store.repo.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status === 'FAILED') {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY);
      return {
        jobId,
        status: job.status,
        message: 'Job processing failed',
        errorCode: job.errorCode,
        errorMessage: job.errorMessage
      };
    }
    if (!job.summaryJson) {
      response.status(HttpStatus.ACCEPTED);
      return {
        jobId,
        status: job.status,
        message: 'Summary is not ready yet'
      };
    }
    return {
      jobId,
      lectureId: job.lectureId,
      summary: JSON.parse(job.summaryJson)
    };
  }

  @Post('/api/v1/jobs/:jobId/flashcards')
  async generateFlashcards(
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(GenerateFlashcardsRequestSchema)) body: { count: number },
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.requestFlashcardsGeneration(jobId, body.count);
    response.status(HttpStatus.ACCEPTED);
    return result;
  }

  @Post('/api/v1/flashcards/generate')
  async generateFlashcardsByJobId(
    @Body(new ZodValidationPipe(GenerateFlashcardsByJobRequestSchema)) body: { jobId: string; count: number },
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.requestFlashcardsGeneration(body.jobId, body.count);
    response.status(HttpStatus.ACCEPTED);
    return result;
  }

  private async requestFlashcardsGeneration(jobId: string, count: number) {
    const job = await this.store.repo.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status === 'FAILED') {
      throw new ConflictException('Cannot generate flashcards for failed job');
    }
    if (!job.transcriptText) {
      throw new ConflictException('Transcript is not ready yet');
    }
    if (job.status === 'GENERATING_FLASHCARDS') {
      throw new ConflictException('Flashcards generation already in progress');
    }

    try {
      await this.store.repo.updateStatus(jobId, 'GENERATING_FLASHCARDS');
      await this.queueService.enqueueFlashcard({
        jobId,
        lectureId: job.lectureId,
        transcriptText: job.transcriptText,
        maxCards: count
      });
    } catch (error) {
      await this.store.repo.updateStatus(jobId, 'COMPLETED');
      const message = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(`Flashcards queue unavailable: ${message}`);
    }
    return {
      jobId,
      status: 'GENERATING_FLASHCARDS',
      requestedCards: count
    };
  }

  private async requestHighlightsGeneration(jobId: string) {
    const job = await this.store.repo.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status === 'FAILED') {
      throw new ConflictException('Cannot generate highlights for failed job');
    }
    if (!this.isAudioVideoJob(job)) {
      throw new ConflictException('Highlights are available only for audio/video files');
    }
    if (!job.transcriptJson) {
      throw new ConflictException('Transcript is not ready yet');
    }
    if (job.status === 'GENERATING_HIGHLIGHTS') {
      throw new ConflictException('Highlights generation already in progress');
    }
    try {
      await this.store.repo.updateStatus(jobId, 'GENERATING_HIGHLIGHTS');
      await this.queueService.enqueueHighlights({
        jobId,
        lectureId: job.lectureId,
        transcriptJson: job.transcriptJson
      });
    } catch (error) {
      await this.store.repo.updateStatus(jobId, 'COMPLETED');
      const message = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(`Highlights queue unavailable: ${message}`);
    }
    return {
      jobId,
      status: 'GENERATING_HIGHLIGHTS'
    };
  }

  private async requestSummaryGeneration(jobId: string) {
    const job = await this.store.repo.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (!job.transcriptText) {
      if (job.status === 'FAILED') {
        throw new ConflictException('Cannot generate summary: job failed before transcript was produced');
      }
      throw new ConflictException('Transcript is not ready yet');
    }
    if (job.status === 'GENERATING_SUMMARY') {
      throw new ConflictException('Summary generation already in progress');
    }
    const transcript = job.transcriptJson ? (JSON.parse(job.transcriptJson) as { duration?: number }) : {};
    const durationSecRaw = Number(transcript.duration ?? 0);
    const durationSec = Number.isFinite(durationSecRaw) ? Math.max(0, Math.floor(durationSecRaw)) : 0;
    try {
      await this.store.repo.updateStatus(jobId, 'GENERATING_SUMMARY');
      await this.queueService.enqueueSummary({
        jobId,
        lectureId: job.lectureId,
        filename: job.filename || `Lecture ${job.lectureId}`,
        transcriptText: job.transcriptText,
        durationSec
      });
    } catch (error) {
      await this.store.repo.updateStatus(jobId, 'COMPLETED');
      const message = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(`Summary queue unavailable: ${message}`);
    }
    return {
      jobId,
      status: 'GENERATING_SUMMARY'
    };
  }

  private statusToProgress(status: string): number {
    const map: Record<string, number> = {
      QUEUED: 5,
      INGESTING: 20,
      INGESTED: 35,
      TRANSCRIBING: 55,
      GENERATING_HIGHLIGHTS: 75,
      GENERATING_SUMMARY: 80,
      GENERATING_FLASHCARDS: 85,
      COMPLETED: 100,
      FAILED: 100
    };
    return map[status] ?? 0;
  }
}

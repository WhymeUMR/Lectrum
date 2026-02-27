import { randomUUID } from 'node:crypto';
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
import { HighlightService } from '../services/highlight.service';

@Controller()
export class AppController {
  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly queueService: QueueService,
    private readonly store: JobStoreService,
    private readonly highlightService: HighlightService
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
    if (!job.transcriptJson) {
      response.status(HttpStatus.ACCEPTED);
      return {
        jobId,
        status: job.status,
        message: 'Transcript highlights are not ready yet'
      };
    }
    const transcript = JSON.parse(job.transcriptJson) as { text?: string; segments?: Array<{ start?: number; end?: number; text?: string }> };
    const highlights = await this.highlightService.getHighlights(transcript, 5);
    return {
      jobId,
      lectureId: job.lectureId,
      highlights
    };
  }

  @Post('/api/v1/jobs/:jobId/flashcards')
  async generateFlashcards(
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(GenerateFlashcardsRequestSchema)) body: { count: number },
    @Res({ passthrough: true }) response: Response
  ) {
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
        maxCards: body.count
      });
    } catch (error) {
      await this.store.repo.updateStatus(jobId, 'COMPLETED');
      const message = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(`Flashcards queue unavailable: ${message}`);
    }

    response.status(HttpStatus.ACCEPTED);
    return {
      jobId,
      status: 'GENERATING_FLASHCARDS',
      requestedCards: body.count
    };
  }

  private statusToProgress(status: string): number {
    const map: Record<string, number> = {
      QUEUED: 5,
      INGESTING: 20,
      INGESTED: 35,
      TRANSCRIBING: 55,
      GENERATING_FLASHCARDS: 85,
      COMPLETED: 100,
      FAILED: 100
    };
    return map[status] ?? 0;
  }
}

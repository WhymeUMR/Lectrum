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
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
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
import { GenerateQuizRequestSchema } from '../dto/generate-quiz-request.schema';
import { CheckQuizAnswersRequestSchema } from '../dto/check-quiz-answers-request.schema';
import { AssistantAskRequestSchema } from '../dto/assistant-ask-request.schema';
import { AssistantRecapRequestSchema } from '../dto/assistant-recap-request.schema';
import { AssistantTtsPreviewRequestSchema } from '../dto/assistant-tts-preview-request.schema';
import {
  AssistantGenerationError,
  MaterialAssistantService
} from '../services/material-assistant.service';
import { AssistantTtsError, AssistantTtsService } from '../services/assistant-tts.service';
import {
  MaterialQuizService,
  QuizAnswerInput,
  QuizGenerationError
} from '../services/material-quiz.service';
import { Public } from '../auth/public.decorator';
import { AuthUser } from '../auth/auth.types';

@Controller()
export class AppController {
  private static readonly MAX_FILENAME_LENGTH = 180;
  private static readonly FILE_SIGNATURE_MIN_BYTES = 4;

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly queueService: QueueService,
    private readonly store: JobStoreService,
    private readonly materialAssistant: MaterialAssistantService,
    private readonly assistantTts: AssistantTtsService,
    private readonly materialQuiz: MaterialQuizService
  ) {}

  @Get('/health')
  @Public()
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
  @Public()
  ready() {
    return { status: 'ready', queues: QUEUE_NAMES };
  }

  @Post('/api/v1/lectures/ingest')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: Number(process.env.UPLOAD_MAX_FILE_SIZE_BYTES || 100 * 1024 * 1024)
      }
    })
  )
  @UsePipes(new ZodValidationPipe(CreateIngestionRequestSchema))
  async createIngestionJob(
    @Body() parsed: any,
    @UploadedFile() file?: { buffer: Buffer },
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const fileBase64 = file?.buffer?.toString('base64') ?? parsed.fileBase64;
    if (parsed.sourceType === 'upload' && !fileBase64) {
      throw new BadRequestException('file is required for upload sourceType');
    }
    if (parsed.sourceType === 'url' && !parsed.sourceUrl) {
      throw new BadRequestException('sourceUrl is required for url sourceType');
    }
    if (parsed.sourceType === 'upload') {
      this.assertSupportedUpload(parsed.filename, parsed.mimeType, fileBase64);
    }

    const activeJob = await this.store.repo.getActiveJobForUser(currentUser.sub);
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
        ownerUserId: currentUser.sub,
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

  private assertSupportedUpload(filename: string, mimeType: string | undefined, fileBase64: string): void {
    const ext = path.extname(String(filename || '')).toLowerCase();
    const mime = String(mimeType || '').toLowerCase();
    const normalizedFilename = String(filename || '').trim();
    if (!normalizedFilename) {
      throw new BadRequestException('filename is required for upload sourceType');
    }
    if (normalizedFilename.length > AppController.MAX_FILENAME_LENGTH) {
      throw new BadRequestException(
        `filename is too long. Max length is ${AppController.MAX_FILENAME_LENGTH} characters`
      );
    }
    if (path.basename(normalizedFilename) !== normalizedFilename || normalizedFilename.includes('\0')) {
      throw new BadRequestException('filename must not contain path separators or null bytes');
    }

    const allowedMimePrefixes = ['audio/', 'video/'];
    const allowedMimeSet = new Set([
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]);
    const allowedExt = new Set([
      '.mp3',
      '.wav',
      '.m4a',
      '.ogg',
      '.aac',
      '.flac',
      '.mp4',
      '.mov',
      '.mkv',
      '.webm',
      '.pdf',
      '.txt',
      '.pptx'
    ]);
    const expectedMimeByExt: Record<string, string[]> = {
      '.pdf': ['application/pdf'],
      '.txt': ['text/plain'],
      '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation']
    };

    const mimeOk =
      mime.length === 0 ||
      allowedMimePrefixes.some((prefix) => mime.startsWith(prefix)) ||
      allowedMimeSet.has(mime);
    const extOk = allowedExt.has(ext);

    if (!mimeOk && !extOk) {
      throw new BadRequestException(
        'Unsupported file type. Allowed: audio/video, PDF, TXT, PPTX'
      );
    }

    if (ext in expectedMimeByExt && mime.length > 0 && !expectedMimeByExt[ext].includes(mime)) {
      throw new BadRequestException(
        `mimeType ${mimeType} does not match filename extension ${ext}`
      );
    }

    const normalizedBase64 = this.normalizeBase64(fileBase64);
    const maxBase64Length = this.maxBase64Length(this.env.UPLOAD_MAX_FILE_SIZE_BYTES);
    if (normalizedBase64.length > maxBase64Length) {
      throw new BadRequestException('Encoded file payload is too large');
    }

    const decoded = this.decodeStrictBase64(normalizedBase64);
    if (decoded.byteLength < AppController.FILE_SIGNATURE_MIN_BYTES) {
      throw new BadRequestException('Uploaded file is too small or empty');
    }

    if (decoded.byteLength > this.env.UPLOAD_MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Uploaded file exceeds max size ${this.env.UPLOAD_MAX_FILE_SIZE_BYTES} bytes`
      );
    }
  }

  private normalizeBase64(payload: string): string {
    const value = String(payload || '').trim();
    if (!value) {
      throw new BadRequestException('fileBase64 must be a non-empty base64 string');
    }

    const marker = 'base64,';
    const markerIndex = value.indexOf(marker);
    const raw = markerIndex >= 0 ? value.slice(markerIndex + marker.length) : value;
    const normalized = raw.replace(/\s+/g, '');
    if (!normalized) {
      throw new BadRequestException('fileBase64 must contain encoded data');
    }
    return normalized;
  }

  private decodeStrictBase64(payload: string): Buffer {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 !== 0) {
      throw new BadRequestException('fileBase64 is not valid base64');
    }

    const decoded = Buffer.from(payload, 'base64');
    if (!decoded.byteLength) {
      throw new BadRequestException('Uploaded file is empty');
    }

    const normalizedDecoded = decoded.toString('base64').replace(/=+$/, '');
    const normalizedInput = payload.replace(/=+$/, '');
    if (normalizedDecoded !== normalizedInput) {
      throw new BadRequestException('fileBase64 is not valid base64');
    }
    return decoded;
  }

  private maxBase64Length(maxBytes: number): number {
    // Base64 expands payload size by ~4/3 (+ small padding).
    return Math.ceil((maxBytes * 4) / 3) + 8;
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
  async getJob(@Param('jobId') jobId: string, @Req() request?: { user?: AuthUser }) {
    const currentUser = this.getCurrentUser(request);
    const job = await this.getOwnedJobOrThrow(jobId, currentUser);
    return job;
  }

  @Get('/api/v1/jobs')
  async listUserJobs(
    @Query('limit') limitRaw?: string,
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const parsedLimit = Number(limitRaw ?? 20);
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, Math.floor(parsedLimit))) : 20;
    const items = await this.store.repo.listJobsForUser(currentUser.sub, limit);
    return {
      items,
      count: items.length,
      limit
    };
  }

  @Get('/api/v1/jobs/:jobId/result')
  async getJobResult(
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) response: Response,
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const job = await this.getOwnedJobOrThrow(jobId, currentUser);

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
      flashcards: job.flashcardsJson ? JSON.parse(job.flashcardsJson) : null,
      quiz: this.safePublicQuiz(job.quizJson)
    };
  }

  @Get('/api/v1/jobs/:jobId/transcript')
  async getFullTranscript(
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) response: Response,
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const job = await this.getOwnedJobOrThrow(jobId, currentUser);
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
    @Res({ passthrough: true }) response: Response,
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const result = await this.requestHighlightsGeneration(jobId, currentUser);
    response.status(HttpStatus.ACCEPTED);
    return result;
  }

  @Get('/api/v1/jobs/:jobId/highlights')
  async getTranscriptHighlights(
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) response: Response,
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const job = await this.getOwnedJobOrThrow(jobId, currentUser);
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
  async generateLectureSummary(
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) response: Response,
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const result = await this.requestSummaryGeneration(jobId, currentUser);
    response.status(HttpStatus.ACCEPTED);
    return result;
  }

  @Get('/api/v1/jobs/:jobId/summary')
  async getLectureSummary(
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) response: Response,
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const job = await this.getOwnedJobOrThrow(jobId, currentUser);
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

  @Post('/api/v1/assistant/ask')
  async askMaterialAssistant(
    @Body(new ZodValidationPipe(AssistantAskRequestSchema))
    body: { jobId: string; question: string; sessionId: string },
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
    if (!job.transcriptText) {
      throw new ConflictException('Transcript is not ready yet');
    }

    const history = await this.store.repo.getAssistantHistory(body.jobId, body.sessionId, 12);
    await this.store.repo.appendAssistantMessage(body.jobId, body.sessionId, 'user', body.question);

    let result: Awaited<ReturnType<MaterialAssistantService['ask']>>;
    try {
      result = await this.materialAssistant.ask({
        question: body.question,
        transcriptText: job.transcriptText,
        transcriptJson: job.transcriptJson,
        summaryJson: job.summaryJson,
        history
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof AssistantGenerationError
          ? error.code
          : 'ASSISTANT_AI_HTTP_ERROR';
      throw new ServiceUnavailableException({
        message: 'Assistant provider is temporarily unavailable',
        errorCode,
        details
      });
    }

    await this.store.repo.appendAssistantMessage(
      body.jobId,
      body.sessionId,
      'assistant',
      result.answer
    );
    await this.store.repo.trimAssistantHistory(body.jobId, body.sessionId, 16);

    return {
      jobId: body.jobId,
      sessionId: body.sessionId,
      answer: result.answer,
      citations: result.citations,
      webSources: result.webSources,
      sources: {
        lecture: result.citations,
        web: result.webSources
      },
      confidence: result.confidence,
      reason: result.reason,
      refused: result.refused
    };
  }

  @Post('/api/v1/assistant/recap-audio')
  async generateAssistantRecapAudio(
    @Body(new ZodValidationPipe(AssistantRecapRequestSchema))
    body: { jobId: string; sessionId: string; ttsModel?: string; ttsVoiceId?: string },
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
    if (!job.transcriptText) {
      throw new ConflictException('Transcript is not ready yet');
    }

    const recapText = await this.generateRecapTextForSession(
      body.jobId,
      body.sessionId,
      job.transcriptText,
      job.summaryJson
    );

    let ttsResult: Awaited<ReturnType<AssistantTtsService['synthesize']>>;
    try {
      ttsResult = await this.assistantTts.synthesize({
        text: recapText,
        ttsModel: body.ttsModel,
        ttsVoiceId: body.ttsVoiceId
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof AssistantTtsError
          ? error.code
          : 'ASSISTANT_TTS_HTTP_ERROR';
      throw new ServiceUnavailableException({
        message: 'TTS provider is temporarily unavailable',
        errorCode,
        details
      });
    }

    await this.store.repo.appendAssistantMessage(
      body.jobId,
      body.sessionId,
      'assistant',
      recapText
    );
    await this.store.repo.trimAssistantHistory(body.jobId, body.sessionId, 16);

    return {
      jobId: body.jobId,
      sessionId: body.sessionId,
      recapText,
      audioBase64: ttsResult.audioBase64,
      audioMimeType: ttsResult.audioMimeType,
      ttsModel: ttsResult.model,
      chunks: ttsResult.chunks
    };
  }

  @Post('/api/v1/assistant/recap')
  async generateAssistantRecapText(
    @Body(new ZodValidationPipe(AssistantRecapRequestSchema))
    body: { jobId: string; sessionId: string },
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
    if (!job.transcriptText) {
      throw new ConflictException('Transcript is not ready yet');
    }

    const recapText = await this.generateRecapTextForSession(
      body.jobId,
      body.sessionId,
      job.transcriptText,
      job.summaryJson
    );

    await this.store.repo.appendAssistantMessage(
      body.jobId,
      body.sessionId,
      'assistant',
      recapText
    );
    await this.store.repo.trimAssistantHistory(body.jobId, body.sessionId, 16);

    return {
      jobId: body.jobId,
      sessionId: body.sessionId,
      recapText
    };
  }

  @Post('/api/v1/assistant/recap-audio/stream')
  async streamAssistantRecapAudio(
    @Body(new ZodValidationPipe(AssistantRecapRequestSchema))
    body: { jobId: string; sessionId: string; ttsModel?: string; ttsVoiceId?: string },
    @Res() response: Response,
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
    if (!job.transcriptText) {
      throw new ConflictException('Transcript is not ready yet');
    }

    const recapText = await this.generateRecapTextForSession(
      body.jobId,
      body.sessionId,
      job.transcriptText,
      job.summaryJson
    );

    let ttsResult: Awaited<ReturnType<AssistantTtsService['synthesizeRaw']>>;
    try {
      ttsResult = await this.assistantTts.synthesizeRaw({
        text: recapText,
        ttsModel: body.ttsModel,
        ttsVoiceId: body.ttsVoiceId
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof AssistantTtsError
          ? error.code
          : 'ASSISTANT_TTS_HTTP_ERROR';
      throw new ServiceUnavailableException({
        message: 'TTS provider is temporarily unavailable',
        errorCode,
        details
      });
    }

    await this.store.repo.appendAssistantMessage(
      body.jobId,
      body.sessionId,
      'assistant',
      recapText
    );
    await this.store.repo.trimAssistantHistory(body.jobId, body.sessionId, 16);

    const recapPreview = encodeURIComponent(recapText.slice(0, 320));
    response.setHeader('content-type', ttsResult.audioMimeType);
    response.setHeader('x-tts-model', ttsResult.model);
    response.setHeader('x-tts-chunks', String(ttsResult.chunks));
    response.setHeader('x-recap-preview', recapPreview);
    response.status(HttpStatus.OK);
    response.send(ttsResult.audioBuffer);
  }

  @Get('/api/v1/assistant/tts/voices')
  async listAssistantTtsVoices() {
    try {
      return await this.assistantTts.listVoices('ru');
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof AssistantTtsError
          ? error.code
          : 'ASSISTANT_TTS_HTTP_ERROR';
      throw new ServiceUnavailableException({
        message: 'TTS voices are temporarily unavailable',
        errorCode,
        details
      });
    }
  }

  @Post('/api/v1/assistant/tts-preview/stream')
  async streamAssistantTtsPreview(
    @Body(new ZodValidationPipe(AssistantTtsPreviewRequestSchema))
    body: { ttsVoiceId: string; ttsModel?: string; text?: string },
    @Res() response: Response
  ) {
    const previewText = String(body.text || '').trim() ||
      'Привет. Это пример выбранного голоса. Если звучание подходит, можно использовать его для озвучки пересказа.';
    let ttsResult: Awaited<ReturnType<AssistantTtsService['synthesizeRaw']>>;
    try {
      ttsResult = await this.assistantTts.synthesizeRaw({
        text: previewText,
        ttsModel: body.ttsModel,
        ttsVoiceId: body.ttsVoiceId
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof AssistantTtsError
          ? error.code
          : 'ASSISTANT_TTS_HTTP_ERROR';
      throw new ServiceUnavailableException({
        message: 'TTS preview is temporarily unavailable',
        errorCode,
        details
      });
    }

    response.setHeader('content-type', ttsResult.audioMimeType);
    response.setHeader('x-tts-model', ttsResult.model);
    response.setHeader('x-tts-chunks', String(ttsResult.chunks));
    response.status(HttpStatus.OK);
    response.send(ttsResult.audioBuffer);
  }

  @Post('/api/v1/assistant/recap-audio/karaoke')
  async generateAssistantRecapAudioKaraoke(
    @Body(new ZodValidationPipe(AssistantRecapRequestSchema))
    body: { jobId: string; sessionId: string; ttsModel?: string; ttsVoiceId?: string },
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
    if (!job.transcriptText) {
      throw new ConflictException('Transcript is not ready yet');
    }

    const recapText = await this.generateRecapTextForSession(
      body.jobId,
      body.sessionId,
      job.transcriptText,
      job.summaryJson
    );

    let ttsResult: Awaited<ReturnType<AssistantTtsService['synthesizeWithTimestamps']>>;
    try {
      ttsResult = await this.assistantTts.synthesizeWithTimestamps({
        text: recapText,
        ttsModel: body.ttsModel,
        ttsVoiceId: body.ttsVoiceId
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof AssistantTtsError
          ? error.code
          : 'ASSISTANT_TTS_HTTP_ERROR';
      throw new ServiceUnavailableException({
        message: 'TTS karaoke is temporarily unavailable',
        errorCode,
        details
      });
    }

    return {
      jobId: body.jobId,
      sessionId: body.sessionId,
      recapText,
      audioBase64: ttsResult.audioBase64,
      audioMimeType: ttsResult.audioMimeType,
      ttsModel: ttsResult.model,
      chunks: ttsResult.chunks,
      words: ttsResult.words
    };
  }

  @Post('/api/v1/jobs/:jobId/flashcards')
  async generateFlashcards(
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(GenerateFlashcardsRequestSchema)) body: { count: number },
    @Res({ passthrough: true }) response: Response,
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const result = await this.requestFlashcardsGeneration(jobId, body.count, currentUser);
    response.status(HttpStatus.ACCEPTED);
    return result;
  }

  @Post('/api/v1/flashcards/generate')
  async generateFlashcardsByJobId(
    @Body(new ZodValidationPipe(GenerateFlashcardsByJobRequestSchema)) body: { jobId: string; count: number },
    @Res({ passthrough: true }) response: Response,
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const result = await this.requestFlashcardsGeneration(body.jobId, body.count, currentUser);
    response.status(HttpStatus.ACCEPTED);
    return result;
  }

  @Post('/api/v1/tests/generate')
  async generateMaterialQuiz(
    @Body(new ZodValidationPipe(GenerateQuizRequestSchema))
    body: { jobId: string; count: number; difficulty: 'easy' | 'medium' | 'hard'; language: string },
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
    if (!job.transcriptText) {
      throw new ConflictException('Transcript is not ready yet');
    }

    try {
      const quiz = await this.materialQuiz.generateQuiz({
        lectureId: job.lectureId,
        transcriptText: job.transcriptText,
        transcriptJson: job.transcriptJson,
        count: body.count,
        difficulty: body.difficulty,
        language: body.language
      });
      await this.store.repo.saveQuiz(body.jobId, JSON.stringify(quiz));
      return {
        jobId: body.jobId,
        quiz: this.materialQuiz.toPublicQuiz(quiz)
      };
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof QuizGenerationError
          ? error.code
          : 'QUIZ_AI_HTTP_ERROR';
      throw new ServiceUnavailableException({
        message: 'Quiz provider is temporarily unavailable',
        errorCode,
        details
      });
    }
  }

  @Post('/api/v1/tests/check')
  async checkMaterialQuiz(
    @Body(new ZodValidationPipe(CheckQuizAnswersRequestSchema))
    body: { jobId: string; answers: QuizAnswerInput[] },
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
    if (!job.quizJson) {
      throw new ConflictException('Quiz is not generated yet');
    }

    let quiz: ReturnType<MaterialQuizService['parseStoredQuiz']>;
    try {
      quiz = this.materialQuiz.parseStoredQuiz(job.quizJson);
    } catch {
      throw new ConflictException('Stored quiz payload is invalid');
    }
    const answers = this.materialQuiz.parseAnswers(body.answers);

    const evaluation = this.materialQuiz.gradeQuiz(quiz, answers);
    return {
      jobId: body.jobId,
      score: {
        total: evaluation.total,
        correct: evaluation.correct,
        percentage: evaluation.percentage
      },
      results: evaluation.results
    };
  }

  @Post('/api/v1/tests/stats')
  async getMaterialQuizStats(
    @Body(new ZodValidationPipe(CheckQuizAnswersRequestSchema))
    body: { jobId: string; answers: QuizAnswerInput[] },
    @Req() request?: { user?: AuthUser }
  ) {
    const currentUser = this.getCurrentUser(request);
    const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
    if (!job.quizJson) {
      throw new ConflictException('Quiz is not generated yet');
    }

    let quiz: ReturnType<MaterialQuizService['parseStoredQuiz']>;
    try {
      quiz = this.materialQuiz.parseStoredQuiz(job.quizJson);
    } catch {
      throw new ConflictException('Stored quiz payload is invalid');
    }
    const answers = this.materialQuiz.parseAnswers(body.answers);
    const evaluation = this.materialQuiz.gradeQuiz(quiz, answers);
    const stats = this.materialQuiz.buildFinalStats(quiz, evaluation);

    return {
      jobId: body.jobId,
      score: stats.score,
      answered: stats.answered,
      wrongCount: stats.wrongCount,
      needsWork: stats.needsWork,
      results: evaluation.results
    };
  }

  private async requestFlashcardsGeneration(jobId: string, count: number, currentUser: AuthUser) {
    const job = await this.getOwnedJobOrThrow(jobId, currentUser);
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

  private async generateRecapTextForSession(
    jobId: string,
    sessionId: string,
    transcriptText: string,
    summaryJson: string | null
  ): Promise<string> {
    const history = await this.store.repo.getAssistantHistory(jobId, sessionId, 12);
    await this.store.repo.appendAssistantMessage(
      jobId,
      sessionId,
      'user',
      'Сделай полный пересказ лекции и озвучь его'
    );

    try {
      const recap = await this.materialAssistant.retellTranscript({
        transcriptText,
        summaryJson,
        history
      });
      return recap.recapText;
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof AssistantGenerationError
          ? error.code
          : 'ASSISTANT_AI_HTTP_ERROR';
      throw new ServiceUnavailableException({
        message: 'Assistant provider is temporarily unavailable',
        errorCode,
        details
      });
    }
  }

  private async requestHighlightsGeneration(jobId: string, currentUser: AuthUser) {
    const job = await this.getOwnedJobOrThrow(jobId, currentUser);
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

  private async requestSummaryGeneration(jobId: string, currentUser: AuthUser) {
    const job = await this.getOwnedJobOrThrow(jobId, currentUser);
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

  private safePublicQuiz(quizJson: string | null): ReturnType<MaterialQuizService['toPublicQuiz']> | null {
    if (!quizJson) {
      return null;
    }
    try {
      return this.materialQuiz.toPublicQuiz(this.materialQuiz.parseStoredQuiz(quizJson));
    } catch {
      return null;
    }
  }

  private getCurrentUser(request?: { user?: AuthUser }): AuthUser {
    if (request?.user) {
      return request.user;
    }
    const isTestMode = process.env.NODE_ENV === 'test' || (this.env as any).APP_ENV === 'test';
    if (!isTestMode) {
      throw new UnauthorizedException('Authorization token is required');
    }
    // Test fallback for direct controller unit tests that bypass Nest guards.
    return {
      sub: 'test-user',
      login: 'test',
      role: 'admin'
    };
  }

  private async getOwnedJobOrThrow(jobId: string, currentUser: AuthUser) {
    const job = await this.store.repo.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (!job.ownerUserId) {
      if (currentUser.role !== 'admin') {
        throw new NotFoundException(`Job ${jobId} not found`);
      }
      return job;
    }
    if (job.ownerUserId !== currentUser.sub) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    return job;
  }
}

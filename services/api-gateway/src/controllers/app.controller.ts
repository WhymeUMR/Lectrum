import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UsePipes
} from '@nestjs/common';
import { QUEUE_NAMES } from '@lecture/contracts';
import { APP_ENV, AppEnv } from '@lecture/config';
import { QueueService } from '../services/queue.service';
import { JobStoreService } from '../services/job-store.service';
import { CreateIngestionRequestSchema } from '../dto/create-ingestion-request.schema';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

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
  @UsePipes(new ZodValidationPipe(CreateIngestionRequestSchema))
  async createIngestionJob(@Body() parsed: any) {
    if (parsed.sourceType === 'upload' && !parsed.fileBase64) {
      throw new BadRequestException('fileBase64 is required for upload sourceType');
    }
    if (parsed.sourceType === 'url' && !parsed.sourceUrl) {
      throw new BadRequestException('sourceUrl is required for url sourceType');
    }

    const lectureId = randomUUID();
    const jobId = randomUUID();

    await this.store.repo.createJob({
      jobId,
      lectureId,
      sourceType: parsed.sourceType,
      filename: parsed.filename,
      mimeType: parsed.mimeType,
      sourceUrl: parsed.sourceUrl,
      requestedLanguage: parsed.requestedLanguage ?? 'ru'
    });

    await this.queueService.enqueueIngestion({
      jobId,
      lectureId,
      sourceType: parsed.sourceType,
      sourceUrl: parsed.sourceUrl,
      filename: parsed.filename,
      mimeType: parsed.mimeType,
      requestedLanguage: parsed.requestedLanguage ?? 'ru',
      uploadedAt: new Date().toISOString(),
      fileBase64: parsed.fileBase64
    });

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
  async getJobResult(@Param('jobId') jobId: string) {
    const job = await this.store.repo.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    if (job.status !== 'COMPLETED') {
      return {
        jobId,
        status: job.status,
        message: 'Result is not ready yet'
      };
    }

    return {
      jobId: job.jobId,
      lectureId: job.lectureId,
      transcriptPath: job.transcriptPath,
      transcriptText: job.transcriptText,
      flashcardsPath: job.flashcardsPath,
      flashcards: job.flashcardsJson ? JSON.parse(job.flashcardsJson) : null
    };
  }
}

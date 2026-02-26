import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Module,
  NotFoundException,
  Param,
  Post
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import { IngestionJobSchema, QUEUE_NAMES, QUEUE_POLICIES } from '@lecture/contracts';
import { APP_ENV, AppEnv, SharedConfigModule, buildRedisConnection } from '@lecture/config';
import { PipelineRepository } from '@lecture/pipeline';

class QueueService {
  private readonly ingestionQueue: Queue;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {
    const redis = buildRedisConnection(env);
    this.ingestionQueue = new Queue(QUEUE_NAMES.ingestion, {
      ...redis,
      defaultJobOptions: QUEUE_POLICIES.ingestion
    });
  }

  async enqueueIngestion(payload: unknown): Promise<void> {
    const parsed = IngestionJobSchema.parse(payload);
    await this.ingestionQueue.add('ingestion-request', parsed);
  }

  async close(): Promise<void> {
    await this.ingestionQueue.close();
  }
}

class JobStoreService {
  readonly repo: PipelineRepository;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for api-gateway');
    }
    this.repo = PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
  }

  async init(): Promise<void> {
    await this.repo.ensureSchema();
  }

  async close(): Promise<void> {
    await this.repo.close();
  }
}

const CreateIngestionRequestSchema = IngestionJobSchema.pick({
  sourceType: true,
  sourceUrl: true,
  filename: true,
  mimeType: true,
  requestedLanguage: true,
  fileBase64: true
});

@Controller()
class AppController {
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
  async createIngestionJob(@Body() body: unknown) {
    const parsed = CreateIngestionRequestSchema.parse(body);

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
      transcriptText: job.transcriptText
    };
  }
}

@Module({
  imports: [SharedConfigModule.forRoot('api-gateway')],
  controllers: [AppController],
  providers: [QueueService, JobStoreService]
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = app.get<AppEnv>(APP_ENV);
  const store = app.get(JobStoreService);
  await store.init();
  await app.listen(env.PORT, '0.0.0.0');

  const queueService = app.get(QueueService);
  process.on('SIGTERM', async () => {
    await queueService.close();
    await store.close();
    await app.close();
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});

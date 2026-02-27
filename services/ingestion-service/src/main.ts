import 'reflect-metadata';
import path from 'node:path';
import { Controller, Get, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Job, Queue, Worker } from 'bullmq';
import { IngestionJobPayload, QUEUE_NAMES, QUEUE_POLICIES } from '@lecture/contracts';
import { APP_ENV, AppEnv, SharedConfigModule, buildRedisConnection } from '@lecture/config';
import { PipelineRepository, decodeBase64Payload, writeArtifact } from '@lecture/pipeline';

class IngestionProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private transcriptionQueue?: Queue;
  private repo: PipelineRepository;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for ingestion-service');
    }
    this.repo = PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
  }

  async onModuleInit() {
    await this.repo.ensureSchema();
    const redis = buildRedisConnection(this.env);

    this.transcriptionQueue = new Queue(QUEUE_NAMES.transcription, {
      ...redis,
      defaultJobOptions: QUEUE_POLICIES.transcription
    });

    this.worker = new Worker(
      QUEUE_NAMES.ingestion,
      async (job: Job<IngestionJobPayload>) => {
        const payload = job.data;
        try {
          await this.repo.updateStatus(payload.jobId, 'INGESTING');

          let relativeStoragePath: string;
          if (payload.sourceType === 'upload') {
            if (!payload.fileBase64) {
              throw new Error('Missing fileBase64 for upload sourceType');
            }
            const safeName = payload.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
            relativeStoragePath = path.join('raw', `${payload.lectureId}_${safeName}`);
            await writeArtifact(
              this.env.ARTIFACTS_DIR,
              relativeStoragePath,
              decodeBase64Payload(payload.fileBase64)
            );
          } else {
            if (!payload.sourceUrl) {
              throw new Error('Missing sourceUrl for url sourceType');
            }
            relativeStoragePath = path.join('raw', `${payload.lectureId}.source-url.txt`);
            await writeArtifact(this.env.ARTIFACTS_DIR, relativeStoragePath, payload.sourceUrl);
          }

          await this.repo.setSourceStoragePath(payload.jobId, relativeStoragePath);
          await this.repo.updateStatus(payload.jobId, 'INGESTED');

          await this.transcriptionQueue?.add('transcribe', {
            jobId: payload.jobId,
            lectureId: payload.lectureId,
            sourceType: payload.sourceType,
            sourceUrl: payload.sourceUrl,
            storagePath: relativeStoragePath,
            mimeType: payload.mimeType,
            language: payload.requestedLanguage ?? 'ru'
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.repo.setError(payload.jobId, 'INGESTION_ERROR', message);
          throw error;
        }
      },
      {
        ...redis,
        removeOnComplete: QUEUE_POLICIES.ingestion.removeOnComplete,
        removeOnFail: QUEUE_POLICIES.ingestion.removeOnFail
      }
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.transcriptionQueue?.close();
    await this.repo.close();
  }
}

@Controller()
class AppController {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  @Get('/health')
  health() {
    return {
      status: 'ok',
      service: this.env.SERVICE_NAME,
      appEnv: this.env.APP_ENV,
      queue: QUEUE_NAMES.ingestion,
      queuePrefix: this.env.REDIS_QUEUE_PREFIX
    };
  }

  @Get('/ready')
  ready() {
    return { status: 'ready' };
  }
}

@Module({
  imports: [SharedConfigModule.forRoot('ingestion-service')],
  controllers: [AppController],
  providers: [IngestionProcessor]
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = app.get<AppEnv>(APP_ENV);
  await app.listen(env.PORT, '0.0.0.0');
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});

import 'reflect-metadata';
import path from 'node:path';
import { Controller, Get, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Job, Worker } from 'bullmq';
import { HighlightGenerationJobPayload, QUEUE_NAMES, QUEUE_POLICIES } from '@lecture/contracts';
import { APP_ENV, AppEnv, SharedConfigModule, buildRedisConnection } from '@lecture/config';
import { PipelineRepository, writeArtifact } from '@lecture/pipeline';
import { generateHighlights, HighlightGenerationError, TranscriptData } from './highlight-generation';

class HighlightProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private repo: PipelineRepository;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for highlight-worker');
    }
    this.repo = PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
  }

  async onModuleInit() {
    await this.repo.ensureSchema();
    const redis = buildRedisConnection(this.env);
    this.worker = new Worker(
      QUEUE_NAMES.highlight,
      async (job: Job<HighlightGenerationJobPayload>) => {
        const payload = job.data;
        try {
          await this.repo.updateStatus(payload.jobId, 'GENERATING_HIGHLIGHTS');
          const transcript = JSON.parse(payload.transcriptJson) as TranscriptData;
          const highlights = await generateHighlights(
            transcript,
            {
              apiKey: this.env.OPENAI_API_KEY,
              model: this.env.OPENAI_MODEL,
              baseUrl: this.env.OPENAI_BASE_URL
            },
            payload.maxHighlights
          );
          const highlightsJson = JSON.stringify(highlights, null, 2);
          const highlightsPath = path.join('highlights', `${payload.lectureId}.json`);
          await writeArtifact(this.env.ARTIFACTS_DIR, highlightsPath, highlightsJson);
          await this.repo.saveHighlights(payload.jobId, highlightsPath, highlightsJson);
          await this.repo.updateStatus(payload.jobId, 'COMPLETED');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const errorCode =
            error instanceof HighlightGenerationError ? error.code : 'HIGHLIGHTS_GENERATION_ERROR';
          await this.repo.setError(payload.jobId, errorCode, message);
          throw error;
        }
      },
      {
        ...redis,
        removeOnComplete: QUEUE_POLICIES.highlight.removeOnComplete,
        removeOnFail: QUEUE_POLICIES.highlight.removeOnFail
      }
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
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
      queue: QUEUE_NAMES.highlight,
      queuePrefix: this.env.REDIS_QUEUE_PREFIX
    };
  }

  @Get('/ready')
  ready() {
    return { status: 'ready' };
  }
}

@Module({
  imports: [SharedConfigModule.forRoot('highlight-worker')],
  controllers: [AppController],
  providers: [HighlightProcessor]
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

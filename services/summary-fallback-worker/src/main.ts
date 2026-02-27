import 'reflect-metadata';
import path from 'node:path';
import { Controller, Get, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Job, Worker } from 'bullmq';
import { QUEUE_NAMES, QUEUE_POLICIES, SummaryGenerationJobPayload } from '@lecture/contracts';
import { APP_ENV, AppEnv, SharedConfigModule, buildRedisConnection } from '@lecture/config';
import { PipelineRepository, writeArtifact } from '@lecture/pipeline';
import { generateSummary, SummaryGenerationError } from './summary-generation';

class SummaryFallbackProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private repo: PipelineRepository;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for summary-fallback-worker');
    }
    this.repo = PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
  }

  async onModuleInit() {
    await this.repo.ensureSchema();
    const redis = buildRedisConnection(this.env);
    this.worker = new Worker(
      QUEUE_NAMES.summaryFallback,
      async (job: Job<SummaryGenerationJobPayload>) => {
        const payload = job.data;
        try {
          await this.repo.updateStatus(payload.jobId, 'GENERATING_SUMMARY');
          const summary = await generateSummary(
            {
              title: payload.filename,
              transcriptText: payload.transcriptText,
              durationSec: payload.durationSec
            },
            {
              apiKey: this.env.OPENAI_API_KEY,
              model: this.env.OPENAI_MODEL,
              baseUrl: this.env.OPENAI_BASE_URL,
              timeoutMs: this.env.SUMMARY_AI_TIMEOUT_MS
            }
          );
          const summaryJson = JSON.stringify(summary, null, 2);
          const summaryPath = path.join('summaries', `${payload.lectureId}.json`);
          await writeArtifact(this.env.ARTIFACTS_DIR, summaryPath, summaryJson);
          await this.repo.saveSummary(payload.jobId, summaryPath, summaryJson);
          await this.repo.updateStatus(payload.jobId, 'COMPLETED');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const errorCode =
            error instanceof SummaryGenerationError ? error.code : 'SUMMARY_GENERATION_ERROR';
          await this.repo.setError(payload.jobId, errorCode, message);
          throw error;
        }
      },
      {
        ...redis,
        removeOnComplete: QUEUE_POLICIES.summaryFallback.removeOnComplete,
        removeOnFail: QUEUE_POLICIES.summaryFallback.removeOnFail
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
      queue: QUEUE_NAMES.summaryFallback,
      queuePrefix: this.env.REDIS_QUEUE_PREFIX
    };
  }

  @Get('/ready')
  ready() {
    return { status: 'ready' };
  }
}

@Module({
  imports: [SharedConfigModule.forRoot('summary-fallback-worker')],
  controllers: [AppController],
  providers: [SummaryFallbackProcessor]
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

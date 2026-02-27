import 'reflect-metadata';
import path from 'node:path';
import { Controller, Get, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Job, Worker } from 'bullmq';
import { QUEUE_NAMES, QUEUE_POLICIES, TranscriptionJobPayload } from '@lecture/contracts';
import { APP_ENV, AppEnv, SharedConfigModule, buildRedisConnection } from '@lecture/config';
import { PipelineRepository, writeArtifact } from '@lecture/pipeline';
import { planChunking, simulateChunkProcessing } from './chunking';
import {
  createTranscriptionProvider,
  TranscriptionProvider,
  TranscriptionProviderError,
  TranscriptResult
} from './transcription-provider';

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function transcribeWithRetry(
  provider: TranscriptionProvider,
  req: Parameters<TranscriptionProvider['transcribe']>[0],
  attempts: number,
  retryDelayMs: number
): Promise<TranscriptResult> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await provider.transcribe(req);
    } catch (error) {
      lastError = error;
      if (i >= attempts) break;
      await sleep(retryDelayMs * i);
    }
  }
  throw lastError;
}

function isRetryableTranscriptionCode(code: string): boolean {
  return (
    code === 'TRANSCRIPTION_PROVIDER_TIMEOUT' ||
    code === 'TRANSCRIPTION_PROVIDER_RATE_LIMIT' ||
    code === 'TRANSCRIPTION_PROVIDER_UNAVAILABLE' ||
    code === 'TRANSCRIPTION_PROVIDER_ERROR'
  );
}

class TranscriptionProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private repo: PipelineRepository;
  private provider: TranscriptionProvider;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for transcription-worker');
    }
    this.repo = PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
    this.provider = createTranscriptionProvider({
      TRANSCRIPTION_PROVIDER: env.TRANSCRIPTION_PROVIDER,
      OPENAI_API_KEY: env.TRANSCRIPTION_OPENAI_API_KEY ?? env.OPENAI_API_KEY,
      OPENAI_BASE_URL: env.TRANSCRIPTION_OPENAI_BASE_URL ?? env.OPENAI_BASE_URL,
      TRANSCRIPTION_OPENAI_MODEL: env.TRANSCRIPTION_OPENAI_MODEL,
      DEEPGRAM_API_KEY: env.DEEPGRAM_API_KEY,
      DEEPGRAM_BASE_URL: env.DEEPGRAM_BASE_URL,
      DEEPGRAM_MODEL: env.DEEPGRAM_MODEL,
      TRANSCRIPTION_PROVIDER_TIMEOUT_MS: env.TRANSCRIPTION_PROVIDER_TIMEOUT_MS
    });
  }

  async onModuleInit() {
    await this.repo.ensureSchema();
    const redis = buildRedisConnection(this.env);

    this.worker = new Worker(
      QUEUE_NAMES.transcription,
      async (job: Job<TranscriptionJobPayload>) => {
        const payload = job.data;
        try {
          await this.repo.updateStatus(payload.jobId, 'TRANSCRIBING');

          const transcriptResult = await transcribeWithRetry(
            this.provider,
            {
              artifactsDir: this.env.ARTIFACTS_DIR,
              storagePath: payload.storagePath,
              requestedLanguage: payload.language
            },
            this.env.TRANSCRIPTION_PROVIDER_RETRY_ATTEMPTS,
            this.env.TRANSCRIPTION_PROVIDER_RETRY_DELAY_MS
          );
          const transcriptText = transcriptResult.text;

          const chunkPlan = planChunking(transcriptText.length, {
            chunkSizeChars: this.env.TRANSCRIPTION_CHUNK_SIZE_CHARS,
            maxParallelChunks: this.env.TRANSCRIPTION_MAX_PARALLEL_CHUNKS,
            chunkDelayMs: this.env.TRANSCRIPTION_CHUNK_DELAY_MS
          });
          await simulateChunkProcessing(chunkPlan, this.env.TRANSCRIPTION_CHUNK_DELAY_MS);
          console.log(
            `transcription chunk plan lecture=${payload.lectureId} chunks=${chunkPlan.chunkCount} waves=${chunkPlan.waves} estimatedMs=${chunkPlan.estimatedLatencyMs}`
          );

          const transcriptRelativePath = path.join('transcripts', `${payload.lectureId}.json`);
          const transcriptPayload = JSON.stringify(transcriptResult, null, 2);
          await writeArtifact(this.env.ARTIFACTS_DIR, transcriptRelativePath, transcriptPayload);

          await this.repo.saveTranscriptResult(
            payload.jobId,
            transcriptRelativePath,
            transcriptText,
            transcriptPayload
          );
          await this.repo.updateStatus(payload.jobId, 'COMPLETED');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const errorCode =
            error instanceof TranscriptionProviderError ? error.code : 'TRANSCRIPTION_ERROR';
          const configuredAttempts = Number(job.opts.attempts ?? 1);
          const hasAttemptsLeft = job.attemptsMade + 1 < configuredAttempts;
          const retryable = isRetryableTranscriptionCode(errorCode);

          if (retryable && hasAttemptsLeft) {
            throw error;
          }

          await this.repo.setError(payload.jobId, errorCode, message);
          return;
        }
      },
      {
        ...redis,
        removeOnComplete: QUEUE_POLICIES.transcription.removeOnComplete,
        removeOnFail: QUEUE_POLICIES.transcription.removeOnFail
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
      queue: QUEUE_NAMES.transcription,
      queuePrefix: this.env.REDIS_QUEUE_PREFIX
    };
  }

  @Get('/ready')
  ready() {
    return { status: 'ready' };
  }
}

@Module({
  imports: [SharedConfigModule.forRoot('transcription-worker')],
  controllers: [AppController],
  providers: [TranscriptionProcessor]
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

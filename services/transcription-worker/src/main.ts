import 'reflect-metadata';
import path from 'node:path';
import { Controller, Get, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Job, Queue, Worker } from 'bullmq';
import { QUEUE_NAMES, QUEUE_POLICIES, TranscriptionJobPayload } from '@lecture/contracts';
import { APP_ENV, AppEnv, SharedConfigModule, buildRedisConnection } from '@lecture/config';
import { PipelineRepository, writeArtifact } from '@lecture/pipeline';

class TranscriptionProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private flashcardQueue?: Queue;
  private repo: PipelineRepository;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for transcription-worker');
    }
    this.repo = PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
  }

  async onModuleInit() {
    await this.repo.ensureSchema();
    const redis = buildRedisConnection(this.env);
    this.flashcardQueue = new Queue(QUEUE_NAMES.flashcard, {
      ...redis,
      defaultJobOptions: QUEUE_POLICIES.flashcard
    });

    this.worker = new Worker(
      QUEUE_NAMES.transcription,
      async (job: Job<TranscriptionJobPayload>) => {
        const payload = job.data;
        try {
          await this.repo.updateStatus(payload.jobId, 'TRANSCRIBING');

          const transcriptText = [
            `lectureId=${payload.lectureId}`,
            `sourceType=${payload.sourceType}`,
            `language=${payload.language}`,
            `storagePath=${payload.storagePath}`,
            payload.sourceUrl ? `sourceUrl=${payload.sourceUrl}` : '',
            'transcript=This is a placeholder transcript produced by the MVP transcription worker.'
          ]
            .filter(Boolean)
            .join('\n');

          const transcriptRelativePath = path.join('transcripts', `${payload.lectureId}.txt`);
          await writeArtifact(this.env.ARTIFACTS_DIR, transcriptRelativePath, transcriptText);

          await this.repo.saveTranscript(payload.jobId, transcriptRelativePath, transcriptText);
          await this.repo.updateStatus(payload.jobId, 'GENERATING_FLASHCARDS');

          await this.flashcardQueue?.add('generate', {
            jobId: payload.jobId,
            lectureId: payload.lectureId,
            transcriptText,
            maxCards: 20
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.repo.setError(payload.jobId, 'TRANSCRIPTION_ERROR', message);
          throw error;
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
    await this.flashcardQueue?.close();
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

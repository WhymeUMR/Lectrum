import 'reflect-metadata';
import path from 'node:path';
import { Controller, Get, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Job, Worker } from 'bullmq';
import { FlashcardGenerationJobPayload, QUEUE_NAMES, QUEUE_POLICIES } from '@lecture/contracts';
import { APP_ENV, AppEnv, SharedConfigModule, buildRedisConnection } from '@lecture/config';
import { PipelineRepository, writeArtifact } from '@lecture/pipeline';
import { generateFlashcardDeck } from './flashcard-generation';
import { evaluateQualityGates } from './quality-gates';

class FlashcardProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private repo: PipelineRepository;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for flashcard-worker');
    }
    this.repo = PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
  }

  async onModuleInit() {
    await this.repo.ensureSchema();
    const redis = buildRedisConnection(this.env);
    this.worker = new Worker(
      QUEUE_NAMES.flashcard,
      async (job: Job<FlashcardGenerationJobPayload>) => {
        const payload = job.data;
        try {
          await this.repo.updateStatus(payload.jobId, 'GENERATING_FLASHCARDS');
          const result = await generateFlashcardDeck(payload, {
            apiKey: this.env.OPENAI_API_KEY,
            model: this.env.OPENAI_MODEL,
            baseUrl: this.env.OPENAI_BASE_URL
          });
          const deck = result.deck;
          const quality = evaluateQualityGates(deck);
          if (!quality.accepted) {
            await this.repo.setError(
              payload.jobId,
              'FLASHCARD_QUALITY_REJECTED',
              quality.reasons.join('; ')
            );
            return;
          }
          const flashcardsJson = JSON.stringify(deck, null, 2);
          const flashcardsPath = path.join('flashcards', `${payload.lectureId}.json`);

          await writeArtifact(this.env.ARTIFACTS_DIR, flashcardsPath, flashcardsJson);
          await this.repo.saveFlashcards(payload.jobId, flashcardsPath, flashcardsJson);
          console.log(
            `flashcard generation done lecture=${payload.lectureId} path=${result.report.path} attempts=${result.report.attempts} quality=${quality.score}`
          );
          await this.repo.updateStatus(payload.jobId, 'COMPLETED');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.repo.setError(payload.jobId, 'FLASHCARD_GENERATION_ERROR', message);
          throw error;
        }
      },
      {
        ...redis,
        removeOnComplete: QUEUE_POLICIES.flashcard.removeOnComplete,
        removeOnFail: QUEUE_POLICIES.flashcard.removeOnFail
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
      queue: QUEUE_NAMES.flashcard,
      queuePrefix: this.env.REDIS_QUEUE_PREFIX
    };
  }

  @Get('/ready')
  ready() {
    return { status: 'ready' };
  }
}

@Module({
  imports: [SharedConfigModule.forRoot('flashcard-worker')],
  controllers: [AppController],
  providers: [FlashcardProcessor]
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

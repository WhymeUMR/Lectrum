import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  FlashcardGenerationJobSchema,
  IngestionJobSchema,
  QUEUE_NAMES,
  QUEUE_POLICIES
} from '@lecture/contracts';
import { APP_ENV, AppEnv, buildRedisConnection } from '@lecture/config';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly ingestionQueue: Queue;
  private readonly flashcardQueue: Queue;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {
    const redis = buildRedisConnection(env);
    this.ingestionQueue = new Queue(QUEUE_NAMES.ingestion, {
      ...redis,
      defaultJobOptions: QUEUE_POLICIES.ingestion
    });
    this.flashcardQueue = new Queue(QUEUE_NAMES.flashcard, {
      ...redis,
      defaultJobOptions: QUEUE_POLICIES.flashcard
    });
  }

  async enqueueIngestion(payload: unknown): Promise<void> {
    const parsed = IngestionJobSchema.parse(payload);
    await this.ingestionQueue.add('ingestion-request', parsed);
  }

  async enqueueFlashcard(payload: unknown): Promise<void> {
    const parsed = FlashcardGenerationJobSchema.parse(payload);
    await this.flashcardQueue.add('generate', parsed);
  }

  async onModuleDestroy(): Promise<void> {
    await this.ingestionQueue.close();
    await this.flashcardQueue.close();
  }
}

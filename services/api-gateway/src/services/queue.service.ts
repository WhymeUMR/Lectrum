import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  FlashcardGenerationJobSchema,
  HighlightGenerationJobSchema,
  IngestionJobSchema,
  QUEUE_NAMES,
  QUEUE_POLICIES,
  SummaryGenerationJobSchema
} from '@lecture/contracts';
import { APP_ENV, AppEnv, buildRedisConnection } from '@lecture/config';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly ingestionQueue: Queue;
  private readonly flashcardQueue: Queue;
  private readonly highlightsQueue: Queue;
  private readonly summaryQueue: Queue;

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
    this.highlightsQueue = new Queue(QUEUE_NAMES.highlight, {
      ...redis,
      defaultJobOptions: QUEUE_POLICIES.highlight
    });
    this.summaryQueue = new Queue(QUEUE_NAMES.summary, {
      ...redis,
      defaultJobOptions: QUEUE_POLICIES.summary
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

  async enqueueHighlights(payload: unknown): Promise<void> {
    const parsed = HighlightGenerationJobSchema.parse(payload);
    await this.highlightsQueue.add('generate', parsed);
  }

  async enqueueSummary(payload: unknown): Promise<void> {
    const parsed = SummaryGenerationJobSchema.parse(payload);
    await this.summaryQueue.add('generate', parsed);
  }

  async onModuleDestroy(): Promise<void> {
    await this.ingestionQueue.close();
    await this.flashcardQueue.close();
    await this.highlightsQueue.close();
    await this.summaryQueue.close();
  }
}

import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { IngestionJobSchema, QUEUE_NAMES, QUEUE_POLICIES } from '@lecture/contracts';
import { APP_ENV, AppEnv, buildRedisConnection } from '@lecture/config';

@Injectable()
export class QueueService implements OnModuleDestroy {
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

  async onModuleDestroy(): Promise<void> {
    await this.ingestionQueue.close();
  }
}

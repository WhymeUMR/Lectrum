import 'reflect-metadata';
import { Body, Controller, Get, Inject, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import {
  FlashcardGenerationJobSchema,
  IngestionJobSchema,
  QUEUE_NAMES,
  QUEUE_POLICIES,
  TranscriptionJobSchema
} from '@lecture/contracts';
import { APP_ENV, AppEnv, SharedConfigModule, buildRedisConnection } from '@lecture/config';

class QueueService {
  private readonly ingestionQueue: Queue;
  private readonly transcriptionQueue: Queue;
  private readonly flashcardQueue: Queue;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {
    const redis = buildRedisConnection(env);
    this.ingestionQueue = new Queue(QUEUE_NAMES.ingestion, {
      ...redis,
      defaultJobOptions: QUEUE_POLICIES.ingestion
    });
    this.transcriptionQueue = new Queue(QUEUE_NAMES.transcription, {
      ...redis,
      defaultJobOptions: QUEUE_POLICIES.transcription
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

  async enqueueTranscription(payload: unknown): Promise<void> {
    const parsed = TranscriptionJobSchema.parse(payload);
    await this.transcriptionQueue.add('transcription-request', parsed);
  }

  async enqueueFlashcard(payload: unknown): Promise<void> {
    const parsed = FlashcardGenerationJobSchema.parse(payload);
    await this.flashcardQueue.add('flashcard-request', parsed);
  }

  async close(): Promise<void> {
    await Promise.all([
      this.ingestionQueue.close(),
      this.transcriptionQueue.close(),
      this.flashcardQueue.close()
    ]);
  }
}

@Controller()
class AppController {
  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly queueService: QueueService
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

  @Post('/jobs/ingestion')
  async enqueueIngestion(@Body() body: unknown) {
    await this.queueService.enqueueIngestion(body);
    return { status: 'accepted', queue: QUEUE_NAMES.ingestion };
  }

  @Post('/jobs/transcription')
  async enqueueTranscription(@Body() body: unknown) {
    await this.queueService.enqueueTranscription(body);
    return { status: 'accepted', queue: QUEUE_NAMES.transcription };
  }

  @Post('/jobs/flashcards')
  async enqueueFlashcards(@Body() body: unknown) {
    await this.queueService.enqueueFlashcard(body);
    return { status: 'accepted', queue: QUEUE_NAMES.flashcard };
  }
}

@Module({
  imports: [SharedConfigModule.forRoot('api-gateway')],
  controllers: [AppController],
  providers: [QueueService]
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = app.get<AppEnv>(APP_ENV);
  await app.listen(env.PORT, '0.0.0.0');

  const queueService = app.get(QueueService);
  process.on('SIGTERM', async () => {
    await queueService.close();
    await app.close();
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});

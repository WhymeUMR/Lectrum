import 'reflect-metadata';
import { Controller, Get, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Job, Queue, Worker } from 'bullmq';
import { QUEUE_NAMES, TranscriptionJobPayload } from '@lecture/contracts';
import { APP_ENV, AppEnv, SharedConfigModule } from '@lecture/config';

class TranscriptionProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private flashcardQueue?: Queue;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  onModuleInit() {
    const connection = { connection: { url: this.env.REDIS_URL } };
    this.flashcardQueue = new Queue(QUEUE_NAMES.flashcard, connection);
    this.worker = new Worker(
      QUEUE_NAMES.transcription,
      async (job: Job<TranscriptionJobPayload>) => {
        await this.flashcardQueue?.add('generate', {
          lectureId: job.data.lectureId,
          transcriptText: `Transcript for ${job.data.lectureId}`,
          maxCards: 20
        });
      },
      connection
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.flashcardQueue?.close();
  }
}

@Controller()
class AppController {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  @Get('/health')
  health() {
    return { status: 'ok', service: this.env.SERVICE_NAME, queue: QUEUE_NAMES.transcription };
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

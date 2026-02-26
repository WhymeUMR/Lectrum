import 'reflect-metadata';
import { Controller, Get, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue, Worker, Job } from 'bullmq';
import { IngestionJobPayload, QUEUE_NAMES } from '@lecture/contracts';
import { APP_ENV, AppEnv, SharedConfigModule } from '@lecture/config';

class IngestionProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private transcriptionQueue?: Queue;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  onModuleInit() {
    const connection = { connection: { url: this.env.REDIS_URL } };
    this.transcriptionQueue = new Queue(QUEUE_NAMES.transcription, connection);
    this.worker = new Worker(
      QUEUE_NAMES.ingestion,
      async (job: Job<IngestionJobPayload>) => {
        await this.transcriptionQueue?.add('transcribe', {
          lectureId: job.data.lectureId,
          storagePath: `uploads/${job.data.filename}`,
          language: 'ru'
        });
      },
      connection
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.transcriptionQueue?.close();
  }
}

@Controller()
class AppController {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  @Get('/health')
  health() {
    return { status: 'ok', service: this.env.SERVICE_NAME, queue: QUEUE_NAMES.ingestion };
  }

  @Get('/ready')
  ready() {
    return { status: 'ready' };
  }
}

@Module({
  imports: [SharedConfigModule.forRoot('ingestion-service')],
  controllers: [AppController],
  providers: [IngestionProcessor]
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

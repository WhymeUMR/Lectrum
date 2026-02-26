import 'reflect-metadata';
import { Controller, Get, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Job, Worker } from 'bullmq';
import { FlashcardGenerationJobPayload, QUEUE_NAMES } from '@lecture/contracts';
import { APP_ENV, AppEnv, SharedConfigModule } from '@lecture/config';

class FlashcardProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  onModuleInit() {
    const connection = { connection: { url: this.env.REDIS_URL } };
    this.worker = new Worker(
      QUEUE_NAMES.flashcard,
      async (job: Job<FlashcardGenerationJobPayload>) => {
        console.log(`Generated ${job.data.maxCards} cards for lecture ${job.data.lectureId}`);
      },
      connection
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}

@Controller()
class AppController {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  @Get('/health')
  health() {
    return { status: 'ok', service: this.env.SERVICE_NAME, queue: QUEUE_NAMES.flashcard };
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

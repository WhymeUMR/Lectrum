import { Module } from '@nestjs/common';
import { SharedConfigModule } from '@lecture/config';
import { AppController } from './controllers/app.controller';
import { QueueService } from './services/queue.service';
import { JobStoreService } from './services/job-store.service';

@Module({
  imports: [SharedConfigModule.forRoot('api-gateway')],
  controllers: [AppController],
  providers: [QueueService, JobStoreService]
})
export class AppModule {}

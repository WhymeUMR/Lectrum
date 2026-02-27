import { Module } from '@nestjs/common';
import { SharedConfigModule } from '@lecture/config';
import { AppController } from './controllers/app.controller';
import { QueueService } from './services/queue.service';
import { JobStoreService } from './services/job-store.service';
import { HighlightService } from './services/highlight.service';

@Module({
  imports: [SharedConfigModule.forRoot('api-gateway')],
  controllers: [AppController],
  providers: [QueueService, JobStoreService, HighlightService]
})
export class AppModule {}

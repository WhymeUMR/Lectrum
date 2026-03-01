import { Module } from '@nestjs/common';
import { SharedConfigModule } from '@lecture/config';
import { AppController } from './controllers/app.controller';
import { QueueService } from './services/queue.service';
import { JobStoreService } from './services/job-store.service';
import { MaterialAssistantService } from './services/material-assistant.service';
import { AssistantTtsService } from './services/assistant-tts.service';
import { MaterialQuizService } from './services/material-quiz.service';

@Module({
  imports: [SharedConfigModule.forRoot('api-gateway')],
  controllers: [AppController],
  providers: [
    QueueService,
    JobStoreService,
    MaterialAssistantService,
    AssistantTtsService,
    MaterialQuizService
  ]
})
export class AppModule {}

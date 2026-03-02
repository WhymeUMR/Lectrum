import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SharedConfigModule } from '@lecture/config';
import { AppController } from './controllers/app.controller';
import { AuthController } from './controllers/auth.controller';
import { QueueService } from './services/queue.service';
import { JobStoreService } from './services/job-store.service';
import { MaterialAssistantService } from './services/material-assistant.service';
import { AssistantTtsService } from './services/assistant-tts.service';
import { MaterialQuizService } from './services/material-quiz.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AuthService } from './auth/auth.service';

@Module({
  imports: [SharedConfigModule.forRoot('api-gateway')],
  controllers: [AppController, AuthController],
  providers: [
    QueueService,
    JobStoreService,
    MaterialAssistantService,
    AssistantTtsService,
    MaterialQuizService,
    AuthService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    }
  ]
})
export class AppModule {}

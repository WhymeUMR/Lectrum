"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@lecture/config");
const app_controller_1 = require("./controllers/app.controller");
const auth_controller_1 = require("./controllers/auth.controller");
const queue_service_1 = require("./services/queue.service");
const job_store_service_1 = require("./services/job-store.service");
const material_assistant_service_1 = require("./services/material-assistant.service");
const assistant_tts_service_1 = require("./services/assistant-tts.service");
const material_quiz_service_1 = require("./services/material-quiz.service");
const jwt_auth_guard_1 = require("./auth/jwt-auth.guard");
const auth_service_1 = require("./auth/auth.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.SharedConfigModule.forRoot('api-gateway')],
        controllers: [app_controller_1.AppController, auth_controller_1.AuthController],
        providers: [
            queue_service_1.QueueService,
            job_store_service_1.JobStoreService,
            material_assistant_service_1.MaterialAssistantService,
            assistant_tts_service_1.AssistantTtsService,
            material_quiz_service_1.MaterialQuizService,
            auth_service_1.AuthService,
            {
                provide: core_1.APP_GUARD,
                useClass: jwt_auth_guard_1.JwtAuthGuard
            }
        ]
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
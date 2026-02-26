"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const bullmq_1 = require("bullmq");
const contracts_1 = require("@lecture/contracts");
const config_1 = require("@lecture/config");
let QueueService = class QueueService {
    constructor(env) {
        this.env = env;
        const redis = (0, config_1.buildRedisConnection)(env);
        this.ingestionQueue = new bullmq_1.Queue(contracts_1.QUEUE_NAMES.ingestion, {
            ...redis,
            defaultJobOptions: contracts_1.QUEUE_POLICIES.ingestion
        });
        this.transcriptionQueue = new bullmq_1.Queue(contracts_1.QUEUE_NAMES.transcription, {
            ...redis,
            defaultJobOptions: contracts_1.QUEUE_POLICIES.transcription
        });
        this.flashcardQueue = new bullmq_1.Queue(contracts_1.QUEUE_NAMES.flashcard, {
            ...redis,
            defaultJobOptions: contracts_1.QUEUE_POLICIES.flashcard
        });
    }
    async enqueueIngestion(payload) {
        const parsed = contracts_1.IngestionJobSchema.parse(payload);
        await this.ingestionQueue.add('ingestion-request', parsed);
    }
    async enqueueTranscription(payload) {
        const parsed = contracts_1.TranscriptionJobSchema.parse(payload);
        await this.transcriptionQueue.add('transcription-request', parsed);
    }
    async enqueueFlashcard(payload) {
        const parsed = contracts_1.FlashcardGenerationJobSchema.parse(payload);
        await this.flashcardQueue.add('flashcard-request', parsed);
    }
    async close() {
        await Promise.all([
            this.ingestionQueue.close(),
            this.transcriptionQueue.close(),
            this.flashcardQueue.close()
        ]);
    }
};
QueueService = __decorate([
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object])
], QueueService);
let AppController = class AppController {
    constructor(env, queueService) {
        this.env = env;
        this.queueService = queueService;
    }
    health() {
        return {
            status: 'ok',
            service: this.env.SERVICE_NAME,
            appEnv: this.env.APP_ENV,
            queuePrefix: this.env.REDIS_QUEUE_PREFIX,
            contractVersion: 'v1'
        };
    }
    ready() {
        return { status: 'ready', queues: contracts_1.QUEUE_NAMES };
    }
    async enqueueIngestion(body) {
        await this.queueService.enqueueIngestion(body);
        return { status: 'accepted', queue: contracts_1.QUEUE_NAMES.ingestion };
    }
    async enqueueTranscription(body) {
        await this.queueService.enqueueTranscription(body);
        return { status: 'accepted', queue: contracts_1.QUEUE_NAMES.transcription };
    }
    async enqueueFlashcards(body) {
        await this.queueService.enqueueFlashcard(body);
        return { status: 'accepted', queue: contracts_1.QUEUE_NAMES.flashcard };
    }
};
__decorate([
    (0, common_1.Get)('/health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('/ready'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "ready", null);
__decorate([
    (0, common_1.Post)('/jobs/ingestion'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "enqueueIngestion", null);
__decorate([
    (0, common_1.Post)('/jobs/transcription'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "enqueueTranscription", null);
__decorate([
    (0, common_1.Post)('/jobs/flashcards'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "enqueueFlashcards", null);
AppController = __decorate([
    (0, common_1.Controller)(),
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object, QueueService])
], AppController);
let AppModule = class AppModule {
};
AppModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.SharedConfigModule.forRoot('api-gateway')],
        controllers: [AppController],
        providers: [QueueService]
    })
], AppModule);
async function bootstrap() {
    const app = await core_1.NestFactory.create(AppModule);
    const env = app.get(config_1.APP_ENV);
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
//# sourceMappingURL=main.js.map
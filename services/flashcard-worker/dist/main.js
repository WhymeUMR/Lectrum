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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const node_path_1 = __importDefault(require("node:path"));
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const bullmq_1 = require("bullmq");
const contracts_1 = require("@lecture/contracts");
const config_1 = require("@lecture/config");
const pipeline_1 = require("@lecture/pipeline");
const flashcard_generation_1 = require("./flashcard-generation");
const quality_gates_1 = require("./quality-gates");
let FlashcardProcessor = class FlashcardProcessor {
    constructor(env) {
        this.env = env;
        if (!env.DATABASE_URL) {
            throw new Error('DATABASE_URL is required for flashcard-worker');
        }
        this.repo = pipeline_1.PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
    }
    async onModuleInit() {
        await this.repo.ensureSchema();
        const redis = (0, config_1.buildRedisConnection)(this.env);
        this.worker = new bullmq_1.Worker(contracts_1.QUEUE_NAMES.flashcard, async (job) => {
            const payload = job.data;
            try {
                await this.repo.updateStatus(payload.jobId, 'GENERATING_FLASHCARDS');
                const result = await (0, flashcard_generation_1.generateFlashcardDeck)(payload, {
                    apiKey: this.env.OPENAI_API_KEY,
                    model: this.env.OPENAI_MODEL,
                    baseUrl: this.env.OPENAI_BASE_URL
                });
                const deck = result.deck;
                const quality = (0, quality_gates_1.evaluateQualityGates)(deck);
                if (!quality.accepted) {
                    await this.repo.setError(payload.jobId, 'FLASHCARD_QUALITY_REJECTED', quality.reasons.join('; '));
                    return;
                }
                const flashcardsJson = JSON.stringify(deck, null, 2);
                const flashcardsPath = node_path_1.default.join('flashcards', `${payload.lectureId}.json`);
                await (0, pipeline_1.writeArtifact)(this.env.ARTIFACTS_DIR, flashcardsPath, flashcardsJson);
                await this.repo.saveFlashcards(payload.jobId, flashcardsPath, flashcardsJson);
                console.log(`flashcard generation done lecture=${payload.lectureId} path=${result.report.path} attempts=${result.report.attempts} quality=${quality.score}`);
                await this.repo.updateStatus(payload.jobId, 'COMPLETED');
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const errorCode = error instanceof flashcard_generation_1.FlashcardGenerationError ? error.code : 'FLASHCARD_GENERATION_ERROR';
                await this.repo.setError(payload.jobId, errorCode, message);
                throw error;
            }
        }, {
            ...redis,
            removeOnComplete: contracts_1.QUEUE_POLICIES.flashcard.removeOnComplete,
            removeOnFail: contracts_1.QUEUE_POLICIES.flashcard.removeOnFail
        });
    }
    async onModuleDestroy() {
        await this.worker?.close();
        await this.repo.close();
    }
};
FlashcardProcessor = __decorate([
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object])
], FlashcardProcessor);
let AppController = class AppController {
    constructor(env) {
        this.env = env;
    }
    health() {
        return {
            status: 'ok',
            service: this.env.SERVICE_NAME,
            appEnv: this.env.APP_ENV,
            queue: contracts_1.QUEUE_NAMES.flashcard,
            queuePrefix: this.env.REDIS_QUEUE_PREFIX
        };
    }
    ready() {
        return { status: 'ready' };
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
AppController = __decorate([
    (0, common_1.Controller)(),
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object])
], AppController);
let AppModule = class AppModule {
};
AppModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.SharedConfigModule.forRoot('flashcard-worker')],
        controllers: [AppController],
        providers: [FlashcardProcessor]
    })
], AppModule);
async function bootstrap() {
    const app = await core_1.NestFactory.create(AppModule);
    const env = app.get(config_1.APP_ENV);
    await app.listen(env.PORT, '0.0.0.0');
}
bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map
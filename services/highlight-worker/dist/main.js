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
const highlight_generation_1 = require("./highlight-generation");
let HighlightProcessor = class HighlightProcessor {
    constructor(env) {
        this.env = env;
        if (!env.DATABASE_URL) {
            throw new Error('DATABASE_URL is required for highlight-worker');
        }
        this.repo = pipeline_1.PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
    }
    async onModuleInit() {
        await this.repo.ensureSchema();
        const redis = (0, config_1.buildRedisConnection)(this.env);
        this.worker = new bullmq_1.Worker(contracts_1.QUEUE_NAMES.highlight, async (job) => {
            const payload = job.data;
            try {
                await this.repo.updateStatus(payload.jobId, 'GENERATING_HIGHLIGHTS');
                const transcript = JSON.parse(payload.transcriptJson);
                const highlights = await (0, highlight_generation_1.generateHighlights)(transcript, {
                    apiKey: this.env.OPENAI_API_KEY,
                    model: this.env.OPENAI_MODEL,
                    baseUrl: this.env.OPENAI_BASE_URL,
                    timeoutMs: Math.max(45_000, Math.floor(this.env.SUMMARY_AI_TIMEOUT_MS / 2))
                }, payload.maxHighlights);
                const highlightsJson = JSON.stringify(highlights, null, 2);
                const highlightsPath = node_path_1.default.join('highlights', `${payload.lectureId}.json`);
                await (0, pipeline_1.writeArtifact)(this.env.ARTIFACTS_DIR, highlightsPath, highlightsJson);
                await this.repo.saveHighlights(payload.jobId, highlightsPath, highlightsJson);
                await this.repo.updateStatus(payload.jobId, 'COMPLETED');
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const errorCode = error instanceof highlight_generation_1.HighlightGenerationError ? error.code : 'HIGHLIGHTS_GENERATION_ERROR';
                await this.repo.setError(payload.jobId, errorCode, message);
                throw error;
            }
        }, {
            ...redis,
            removeOnComplete: contracts_1.QUEUE_POLICIES.highlight.removeOnComplete,
            removeOnFail: contracts_1.QUEUE_POLICIES.highlight.removeOnFail
        });
    }
    async onModuleDestroy() {
        await this.worker?.close();
        await this.repo.close();
    }
};
HighlightProcessor = __decorate([
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object])
], HighlightProcessor);
let AppController = class AppController {
    constructor(env) {
        this.env = env;
    }
    health() {
        return {
            status: 'ok',
            service: this.env.SERVICE_NAME,
            appEnv: this.env.APP_ENV,
            queue: contracts_1.QUEUE_NAMES.highlight,
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
        imports: [config_1.SharedConfigModule.forRoot('highlight-worker')],
        controllers: [AppController],
        providers: [HighlightProcessor]
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
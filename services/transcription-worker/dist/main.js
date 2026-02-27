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
const chunking_1 = require("./chunking");
let TranscriptionProcessor = class TranscriptionProcessor {
    constructor(env) {
        this.env = env;
        if (!env.DATABASE_URL) {
            throw new Error('DATABASE_URL is required for transcription-worker');
        }
        this.repo = pipeline_1.PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
    }
    async onModuleInit() {
        await this.repo.ensureSchema();
        const redis = (0, config_1.buildRedisConnection)(this.env);
        this.flashcardQueue = new bullmq_1.Queue(contracts_1.QUEUE_NAMES.flashcard, {
            ...redis,
            defaultJobOptions: contracts_1.QUEUE_POLICIES.flashcard
        });
        this.worker = new bullmq_1.Worker(contracts_1.QUEUE_NAMES.transcription, async (job) => {
            const payload = job.data;
            try {
                await this.repo.updateStatus(payload.jobId, 'TRANSCRIBING');
                const transcriptText = [
                    `lectureId=${payload.lectureId}`,
                    `sourceType=${payload.sourceType}`,
                    `language=${payload.language}`,
                    `storagePath=${payload.storagePath}`,
                    payload.sourceUrl ? `sourceUrl=${payload.sourceUrl}` : '',
                    'transcript=This is a placeholder transcript produced by the MVP transcription worker.'
                ]
                    .filter(Boolean)
                    .join('\n');
                const chunkPlan = (0, chunking_1.planChunking)(transcriptText.length, {
                    chunkSizeChars: this.env.TRANSCRIPTION_CHUNK_SIZE_CHARS,
                    maxParallelChunks: this.env.TRANSCRIPTION_MAX_PARALLEL_CHUNKS,
                    chunkDelayMs: this.env.TRANSCRIPTION_CHUNK_DELAY_MS
                });
                await (0, chunking_1.simulateChunkProcessing)(chunkPlan, this.env.TRANSCRIPTION_CHUNK_DELAY_MS);
                console.log(`transcription chunk plan lecture=${payload.lectureId} chunks=${chunkPlan.chunkCount} waves=${chunkPlan.waves} estimatedMs=${chunkPlan.estimatedLatencyMs}`);
                const transcriptRelativePath = node_path_1.default.join('transcripts', `${payload.lectureId}.txt`);
                await (0, pipeline_1.writeArtifact)(this.env.ARTIFACTS_DIR, transcriptRelativePath, transcriptText);
                await this.repo.saveTranscript(payload.jobId, transcriptRelativePath, transcriptText);
                await this.repo.updateStatus(payload.jobId, 'GENERATING_FLASHCARDS');
                await this.flashcardQueue?.add('generate', {
                    jobId: payload.jobId,
                    lectureId: payload.lectureId,
                    transcriptText,
                    maxCards: 20
                });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await this.repo.setError(payload.jobId, 'TRANSCRIPTION_ERROR', message);
                throw error;
            }
        }, {
            ...redis,
            removeOnComplete: contracts_1.QUEUE_POLICIES.transcription.removeOnComplete,
            removeOnFail: contracts_1.QUEUE_POLICIES.transcription.removeOnFail
        });
    }
    async onModuleDestroy() {
        await this.worker?.close();
        await this.flashcardQueue?.close();
        await this.repo.close();
    }
};
TranscriptionProcessor = __decorate([
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object])
], TranscriptionProcessor);
let AppController = class AppController {
    constructor(env) {
        this.env = env;
    }
    health() {
        return {
            status: 'ok',
            service: this.env.SERVICE_NAME,
            appEnv: this.env.APP_ENV,
            queue: contracts_1.QUEUE_NAMES.transcription,
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
        imports: [config_1.SharedConfigModule.forRoot('transcription-worker')],
        controllers: [AppController],
        providers: [TranscriptionProcessor]
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
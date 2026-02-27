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
const transcription_provider_1 = require("./transcription-provider");
const document_extractor_1 = require("./document-extractor");
async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
async function transcribeWithRetry(provider, req, attempts, retryDelayMs) {
    let lastError;
    for (let i = 1; i <= attempts; i += 1) {
        try {
            return await provider.transcribe(req);
        }
        catch (error) {
            lastError = error;
            if (i >= attempts)
                break;
            await sleep(retryDelayMs * i);
        }
    }
    throw lastError;
}
function isRetryableTranscriptionCode(code) {
    return (code === 'TRANSCRIPTION_PROVIDER_TIMEOUT' ||
        code === 'TRANSCRIPTION_PROVIDER_RATE_LIMIT' ||
        code === 'TRANSCRIPTION_PROVIDER_UNAVAILABLE' ||
        code === 'TRANSCRIPTION_PROVIDER_ERROR');
}
let TranscriptionProcessor = class TranscriptionProcessor {
    constructor(env) {
        this.env = env;
        if (!env.DATABASE_URL) {
            throw new Error('DATABASE_URL is required for transcription-worker');
        }
        this.repo = pipeline_1.PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
        this.provider = (0, transcription_provider_1.createTranscriptionProvider)({
            TRANSCRIPTION_PROVIDER: env.TRANSCRIPTION_PROVIDER,
            OPENAI_API_KEY: env.TRANSCRIPTION_OPENAI_API_KEY ?? env.OPENAI_API_KEY,
            OPENAI_BASE_URL: env.TRANSCRIPTION_OPENAI_BASE_URL ?? env.OPENAI_BASE_URL,
            TRANSCRIPTION_OPENAI_MODEL: env.TRANSCRIPTION_OPENAI_MODEL,
            DEEPGRAM_API_KEY: env.DEEPGRAM_API_KEY,
            DEEPGRAM_BASE_URL: env.DEEPGRAM_BASE_URL,
            DEEPGRAM_MODEL: env.DEEPGRAM_MODEL,
            TRANSCRIPTION_PROVIDER_TIMEOUT_MS: env.TRANSCRIPTION_PROVIDER_TIMEOUT_MS
        });
    }
    async onModuleInit() {
        await this.repo.ensureSchema();
        const redis = (0, config_1.buildRedisConnection)(this.env);
        this.worker = new bullmq_1.Worker(contracts_1.QUEUE_NAMES.transcription, async (job) => {
            const payload = job.data;
            try {
                await this.repo.updateStatus(payload.jobId, 'TRANSCRIBING');
                const transcriptResult = (0, document_extractor_1.isDocumentInput)(payload.storagePath, payload.mimeType)
                    ? await (0, document_extractor_1.extractDocumentTranscript)(this.env.ARTIFACTS_DIR, payload.storagePath, payload.language)
                    : await transcribeWithRetry(this.provider, {
                        artifactsDir: this.env.ARTIFACTS_DIR,
                        storagePath: payload.storagePath,
                        requestedLanguage: payload.language,
                        mimeType: payload.mimeType
                    }, this.env.TRANSCRIPTION_PROVIDER_RETRY_ATTEMPTS, this.env.TRANSCRIPTION_PROVIDER_RETRY_DELAY_MS);
                const transcriptText = transcriptResult.text;
                const chunkPlan = (0, chunking_1.planChunking)(transcriptText.length, {
                    chunkSizeChars: this.env.TRANSCRIPTION_CHUNK_SIZE_CHARS,
                    maxParallelChunks: this.env.TRANSCRIPTION_MAX_PARALLEL_CHUNKS,
                    chunkDelayMs: this.env.TRANSCRIPTION_CHUNK_DELAY_MS
                });
                await (0, chunking_1.simulateChunkProcessing)(chunkPlan, this.env.TRANSCRIPTION_CHUNK_DELAY_MS);
                console.log(`transcription chunk plan lecture=${payload.lectureId} chunks=${chunkPlan.chunkCount} waves=${chunkPlan.waves} estimatedMs=${chunkPlan.estimatedLatencyMs}`);
                const transcriptRelativePath = node_path_1.default.join('transcripts', `${payload.lectureId}.json`);
                const transcriptPayload = JSON.stringify(transcriptResult, null, 2);
                await (0, pipeline_1.writeArtifact)(this.env.ARTIFACTS_DIR, transcriptRelativePath, transcriptPayload);
                await this.repo.saveTranscriptResult(payload.jobId, transcriptRelativePath, transcriptText, transcriptPayload);
                await this.repo.updateStatus(payload.jobId, 'COMPLETED');
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const errorCode = (() => {
                    if (error instanceof transcription_provider_1.TranscriptionProviderError) {
                        return error.code;
                    }
                    if (error instanceof document_extractor_1.DocumentExtractionError) {
                        return error.code;
                    }
                    return 'TRANSCRIPTION_ERROR';
                })();
                const configuredAttempts = Number(job.opts.attempts ?? 1);
                const hasAttemptsLeft = job.attemptsMade + 1 < configuredAttempts;
                const retryable = isRetryableTranscriptionCode(errorCode);
                if (retryable && hasAttemptsLeft) {
                    throw error;
                }
                await this.repo.setError(payload.jobId, errorCode, message);
                return;
            }
        }, {
            ...redis,
            removeOnComplete: contracts_1.QUEUE_POLICIES.transcription.removeOnComplete,
            removeOnFail: contracts_1.QUEUE_POLICIES.transcription.removeOnFail
        });
    }
    async onModuleDestroy() {
        await this.worker?.close();
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
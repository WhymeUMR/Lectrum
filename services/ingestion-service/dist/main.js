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
class UrlParsingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UrlParsingError';
    }
}
class VideoDownloadError extends Error {
    constructor(message) {
        super(message);
        this.name = 'VideoDownloadError';
    }
}
async function parseUrlSource(serviceUrl, sourceUrl, language, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${serviceUrl.replace(/\/+$/, '')}/api/v1/parse`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: sourceUrl, language }),
            signal: controller.signal
        });
        if (!response.ok) {
            const body = await response.text();
            throw new UrlParsingError(`url-parser-service returned ${response.status}: ${body || response.statusText}`);
        }
        const payload = (await response.json());
        const text = String(payload.text ?? '').trim();
        if (!text) {
            throw new UrlParsingError('url-parser-service returned empty text');
        }
        return {
            text,
            sourceUrl: String(payload.sourceUrl ?? sourceUrl),
            language: String(payload.language ?? language)
        };
    }
    catch (error) {
        if (error instanceof UrlParsingError) {
            throw error;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new UrlParsingError(`url-parser-service request timeout after ${timeoutMs}ms`);
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new UrlParsingError(message);
    }
    finally {
        clearTimeout(timer);
    }
}
async function downloadVideoSource(serviceUrl, lectureId, sourceUrl, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${serviceUrl.replace(/\/+$/, '')}/api/v1/download`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ lectureId, url: sourceUrl }),
            signal: controller.signal
        });
        if (!response.ok) {
            const body = await response.text();
            throw new VideoDownloadError(`video-parser-service returned ${response.status}: ${body || response.statusText}`);
        }
        const payload = (await response.json());
        const storagePath = String(payload.storagePath ?? '').trim();
        if (!storagePath) {
            throw new VideoDownloadError('video-parser-service returned empty storagePath');
        }
        return {
            lectureId: String(payload.lectureId ?? lectureId),
            sourceUrl: String(payload.sourceUrl ?? sourceUrl),
            storagePath,
            filename: String(payload.filename ?? ''),
            mimeType: String(payload.mimeType ?? 'application/octet-stream')
        };
    }
    catch (error) {
        if (error instanceof VideoDownloadError) {
            throw error;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new VideoDownloadError(`video-parser-service request timeout after ${timeoutMs}ms`);
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new VideoDownloadError(message);
    }
    finally {
        clearTimeout(timer);
    }
}
let IngestionProcessor = class IngestionProcessor {
    constructor(env) {
        this.env = env;
        if (!env.DATABASE_URL) {
            throw new Error('DATABASE_URL is required for ingestion-service');
        }
        this.repo = pipeline_1.PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
    }
    async onModuleInit() {
        await this.repo.ensureSchema();
        const redis = (0, config_1.buildRedisConnection)(this.env);
        this.transcriptionQueue = new bullmq_1.Queue(contracts_1.QUEUE_NAMES.transcription, {
            ...redis,
            defaultJobOptions: contracts_1.QUEUE_POLICIES.transcription
        });
        this.worker = new bullmq_1.Worker(contracts_1.QUEUE_NAMES.ingestion, async (job) => {
            const payload = job.data;
            try {
                await this.repo.updateStatus(payload.jobId, 'INGESTING');
                let relativeStoragePath;
                let resolvedMimeType = payload.mimeType;
                if (payload.sourceType === 'upload') {
                    if (!payload.fileBase64) {
                        throw new Error('Missing fileBase64 for upload sourceType');
                    }
                    const safeName = payload.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
                    relativeStoragePath = node_path_1.default.join('raw', `${payload.lectureId}_${safeName}`);
                    await (0, pipeline_1.writeArtifact)(this.env.ARTIFACTS_DIR, relativeStoragePath, (0, pipeline_1.decodeBase64Payload)(payload.fileBase64));
                }
                else if (payload.sourceType === 'url') {
                    if (!payload.sourceUrl) {
                        throw new Error('Missing sourceUrl for url sourceType');
                    }
                    if (!this.env.URL_PARSER_SERVICE_URL) {
                        throw new Error('URL_PARSER_SERVICE_URL is required for url sourceType');
                    }
                    const parsed = await parseUrlSource(this.env.URL_PARSER_SERVICE_URL, payload.sourceUrl, payload.requestedLanguage ?? 'ru', this.env.URL_PARSER_TIMEOUT_MS);
                    relativeStoragePath = node_path_1.default.join('raw', `${payload.lectureId}_url.txt`);
                    await (0, pipeline_1.writeArtifact)(this.env.ARTIFACTS_DIR, relativeStoragePath, parsed.text);
                    resolvedMimeType = 'text/plain';
                }
                else {
                    if (!payload.sourceUrl) {
                        throw new Error('Missing sourceUrl for video_url sourceType');
                    }
                    if (!this.env.VIDEO_PARSER_SERVICE_URL) {
                        throw new Error('VIDEO_PARSER_SERVICE_URL is required for video_url sourceType');
                    }
                    const downloaded = await downloadVideoSource(this.env.VIDEO_PARSER_SERVICE_URL, payload.lectureId, payload.sourceUrl, this.env.VIDEO_PARSER_TIMEOUT_MS);
                    relativeStoragePath = downloaded.storagePath;
                    resolvedMimeType = downloaded.mimeType || payload.mimeType;
                }
                await this.repo.setSourceStoragePath(payload.jobId, relativeStoragePath);
                await this.repo.updateStatus(payload.jobId, 'INGESTED');
                await this.transcriptionQueue?.add('transcribe', {
                    jobId: payload.jobId,
                    lectureId: payload.lectureId,
                    sourceType: payload.sourceType,
                    sourceUrl: payload.sourceUrl,
                    storagePath: relativeStoragePath,
                    mimeType: resolvedMimeType,
                    language: payload.requestedLanguage ?? 'ru'
                });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await this.repo.setError(payload.jobId, 'INGESTION_ERROR', message);
                throw error;
            }
        }, {
            ...redis,
            removeOnComplete: contracts_1.QUEUE_POLICIES.ingestion.removeOnComplete,
            removeOnFail: contracts_1.QUEUE_POLICIES.ingestion.removeOnFail
        });
    }
    async onModuleDestroy() {
        await this.worker?.close();
        await this.transcriptionQueue?.close();
        await this.repo.close();
    }
};
IngestionProcessor = __decorate([
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object])
], IngestionProcessor);
let AppController = class AppController {
    constructor(env) {
        this.env = env;
    }
    health() {
        return {
            status: 'ok',
            service: this.env.SERVICE_NAME,
            appEnv: this.env.APP_ENV,
            queue: contracts_1.QUEUE_NAMES.ingestion,
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
        imports: [config_1.SharedConfigModule.forRoot('ingestion-service')],
        controllers: [AppController],
        providers: [IngestionProcessor]
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
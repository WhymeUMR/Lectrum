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
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const bullmq_1 = require("bullmq");
const contracts_1 = require("@lecture/contracts");
const config_1 = require("@lecture/config");
const pipeline_1 = require("@lecture/pipeline");
let QueueService = class QueueService {
    constructor(env) {
        this.env = env;
        const redis = (0, config_1.buildRedisConnection)(env);
        this.ingestionQueue = new bullmq_1.Queue(contracts_1.QUEUE_NAMES.ingestion, {
            ...redis,
            defaultJobOptions: contracts_1.QUEUE_POLICIES.ingestion
        });
    }
    async enqueueIngestion(payload) {
        const parsed = contracts_1.IngestionJobSchema.parse(payload);
        await this.ingestionQueue.add('ingestion-request', parsed);
    }
    async close() {
        await this.ingestionQueue.close();
    }
};
QueueService = __decorate([
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object])
], QueueService);
let JobStoreService = class JobStoreService {
    constructor(env) {
        if (!env.DATABASE_URL) {
            throw new Error('DATABASE_URL is required for api-gateway');
        }
        this.repo = pipeline_1.PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
    }
    async init() {
        await this.repo.ensureSchema();
    }
    async close() {
        await this.repo.close();
    }
};
JobStoreService = __decorate([
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object])
], JobStoreService);
const CreateIngestionRequestSchema = contracts_1.IngestionJobSchema.pick({
    sourceType: true,
    sourceUrl: true,
    filename: true,
    mimeType: true,
    requestedLanguage: true,
    fileBase64: true
});
let AppController = class AppController {
    constructor(env, queueService, store) {
        this.env = env;
        this.queueService = queueService;
        this.store = store;
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
    async createIngestionJob(body) {
        const parsed = CreateIngestionRequestSchema.parse(body);
        if (parsed.sourceType === 'upload' && !parsed.fileBase64) {
            throw new common_1.BadRequestException('fileBase64 is required for upload sourceType');
        }
        if (parsed.sourceType === 'url' && !parsed.sourceUrl) {
            throw new common_1.BadRequestException('sourceUrl is required for url sourceType');
        }
        const lectureId = (0, node_crypto_1.randomUUID)();
        const jobId = (0, node_crypto_1.randomUUID)();
        await this.store.repo.createJob({
            jobId,
            lectureId,
            sourceType: parsed.sourceType,
            filename: parsed.filename,
            mimeType: parsed.mimeType,
            sourceUrl: parsed.sourceUrl,
            requestedLanguage: parsed.requestedLanguage ?? 'ru'
        });
        await this.queueService.enqueueIngestion({
            jobId,
            lectureId,
            sourceType: parsed.sourceType,
            sourceUrl: parsed.sourceUrl,
            filename: parsed.filename,
            mimeType: parsed.mimeType,
            requestedLanguage: parsed.requestedLanguage ?? 'ru',
            uploadedAt: new Date().toISOString(),
            fileBase64: parsed.fileBase64
        });
        return {
            jobId,
            lectureId,
            status: 'QUEUED',
            queue: contracts_1.QUEUE_NAMES.ingestion
        };
    }
    async getJob(jobId) {
        const job = await this.store.repo.getJob(jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${jobId} not found`);
        }
        return job;
    }
    async getJobResult(jobId) {
        const job = await this.store.repo.getJob(jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${jobId} not found`);
        }
        if (job.status !== 'COMPLETED') {
            return {
                jobId,
                status: job.status,
                message: 'Result is not ready yet'
            };
        }
        return {
            jobId: job.jobId,
            lectureId: job.lectureId,
            transcriptPath: job.transcriptPath,
            transcriptText: job.transcriptText
        };
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
    (0, common_1.Post)('/api/v1/lectures/ingest'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "createIngestionJob", null);
__decorate([
    (0, common_1.Get)('/api/v1/jobs/:jobId'),
    __param(0, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getJob", null);
__decorate([
    (0, common_1.Get)('/api/v1/jobs/:jobId/result'),
    __param(0, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getJobResult", null);
AppController = __decorate([
    (0, common_1.Controller)(),
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object, QueueService,
        JobStoreService])
], AppController);
let AppModule = class AppModule {
};
AppModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.SharedConfigModule.forRoot('api-gateway')],
        controllers: [AppController],
        providers: [QueueService, JobStoreService]
    })
], AppModule);
async function bootstrap() {
    const app = await core_1.NestFactory.create(AppModule);
    const env = app.get(config_1.APP_ENV);
    const store = app.get(JobStoreService);
    await store.init();
    await app.listen(env.PORT, '0.0.0.0');
    const queueService = app.get(QueueService);
    process.on('SIGTERM', async () => {
        await queueService.close();
        await store.close();
        await app.close();
    });
}
bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map
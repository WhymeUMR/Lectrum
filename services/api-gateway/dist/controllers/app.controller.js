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
exports.AppController = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const contracts_1 = require("@lecture/contracts");
const config_1 = require("@lecture/config");
const queue_service_1 = require("../services/queue.service");
const job_store_service_1 = require("../services/job-store.service");
const create_ingestion_request_schema_1 = require("../dto/create-ingestion-request.schema");
const zod_validation_pipe_1 = require("../pipes/zod-validation.pipe");
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
    async createIngestionJob(parsed) {
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
            transcriptText: job.transcriptText,
            flashcardsPath: job.flashcardsPath,
            flashcards: job.flashcardsJson ? JSON.parse(job.flashcardsJson) : null
        };
    }
};
exports.AppController = AppController;
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
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(create_ingestion_request_schema_1.CreateIngestionRequestSchema)),
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
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object, queue_service_1.QueueService,
        job_store_service_1.JobStoreService])
], AppController);
//# sourceMappingURL=app.controller.js.map
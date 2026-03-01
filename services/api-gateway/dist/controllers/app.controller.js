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
exports.AppController = void 0;
const node_crypto_1 = require("node:crypto");
const node_path_1 = __importDefault(require("node:path"));
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const contracts_1 = require("@lecture/contracts");
const config_1 = require("@lecture/config");
const pipeline_1 = require("@lecture/pipeline");
const queue_service_1 = require("../services/queue.service");
const job_store_service_1 = require("../services/job-store.service");
const create_ingestion_request_schema_1 = require("../dto/create-ingestion-request.schema");
const zod_validation_pipe_1 = require("../pipes/zod-validation.pipe");
const generate_flashcards_request_schema_1 = require("../dto/generate-flashcards-request.schema");
const generate_flashcards_by_job_request_schema_1 = require("../dto/generate-flashcards-by-job-request.schema");
const assistant_ask_request_schema_1 = require("../dto/assistant-ask-request.schema");
const assistant_recap_request_schema_1 = require("../dto/assistant-recap-request.schema");
const material_assistant_service_1 = require("../services/material-assistant.service");
const assistant_tts_service_1 = require("../services/assistant-tts.service");
let AppController = class AppController {
    constructor(env, queueService, store, materialAssistant, assistantTts) {
        this.env = env;
        this.queueService = queueService;
        this.store = store;
        this.materialAssistant = materialAssistant;
        this.assistantTts = assistantTts;
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
    async createIngestionJob(parsed, file) {
        const fileBase64 = file?.buffer?.toString('base64') ?? parsed.fileBase64;
        if (parsed.sourceType === 'upload' && !fileBase64) {
            throw new common_1.BadRequestException('file is required for upload sourceType');
        }
        if (parsed.sourceType === 'url' && !parsed.sourceUrl) {
            throw new common_1.BadRequestException('sourceUrl is required for url sourceType');
        }
        if (parsed.sourceType === 'upload') {
            this.assertSupportedUpload(parsed.filename, parsed.mimeType);
        }
        const activeJob = await this.store.repo.getActiveJob();
        if (activeJob) {
            throw new common_1.ConflictException(`Another lecture is still processing (jobId=${activeJob.jobId}, status=${activeJob.status}). Wait until it is COMPLETED or FAILED.`);
        }
        const lectureId = (0, node_crypto_1.randomUUID)();
        const jobId = (0, node_crypto_1.randomUUID)();
        try {
            await this.store.repo.createJob({
                jobId,
                lectureId,
                sourceType: parsed.sourceType,
                filename: parsed.filename,
                mimeType: parsed.mimeType,
                sourceUrl: parsed.sourceUrl,
                requestedLanguage: parsed.requestedLanguage ?? 'ru'
            });
        }
        catch (error) {
            if (error instanceof pipeline_1.ActiveJobExistsError) {
                throw new common_1.ConflictException('Another lecture is still processing. Wait until the active job is COMPLETED or FAILED.');
            }
            throw error;
        }
        try {
            await this.queueService.enqueueIngestion({
                jobId,
                lectureId,
                sourceType: parsed.sourceType,
                sourceUrl: parsed.sourceUrl,
                filename: parsed.filename,
                mimeType: parsed.mimeType,
                requestedLanguage: parsed.requestedLanguage ?? 'ru',
                uploadedAt: new Date().toISOString(),
                fileBase64
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.store.repo.setError(jobId, 'INGESTION_ENQUEUE_ERROR', message);
            throw new common_1.ServiceUnavailableException('Queue is temporarily unavailable');
        }
        return {
            jobId,
            lectureId,
            status: 'QUEUED',
            queue: contracts_1.QUEUE_NAMES.ingestion
        };
    }
    assertSupportedUpload(filename, mimeType) {
        const ext = node_path_1.default.extname(String(filename || '')).toLowerCase();
        const mime = String(mimeType || '').toLowerCase();
        const allowedMimePrefix = ['audio/', 'video/'];
        const allowedMimeSet = new Set([
            'application/pdf',
            'text/plain',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        ]);
        const allowedExt = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac', '.mp4', '.mov', '.mkv', '.webm', '.pdf', '.txt', '.pptx']);
        const mimeOk = mime.length === 0 ||
            allowedMimePrefix.some((prefix) => mime.startsWith(prefix)) ||
            allowedMimeSet.has(mime);
        const extOk = allowedExt.has(ext);
        if (!mimeOk && !extOk) {
            throw new common_1.BadRequestException('Unsupported file type. Allowed: audio/video, PDF, TXT, PPTX');
        }
    }
    isAudioVideoJob(job) {
        const mime = String(job.mimeType ?? '').toLowerCase();
        if (mime.startsWith('audio/') || mime.startsWith('video/')) {
            return true;
        }
        const allowedMediaExt = new Set([
            '.mp3',
            '.wav',
            '.m4a',
            '.ogg',
            '.aac',
            '.flac',
            '.mp4',
            '.mov',
            '.mkv',
            '.webm'
        ]);
        const filenameExt = node_path_1.default.extname(String(job.filename ?? '')).toLowerCase();
        const storageExt = node_path_1.default.extname(String(job.storagePath ?? '')).toLowerCase();
        return allowedMediaExt.has(filenameExt) || allowedMediaExt.has(storageExt);
    }
    async getJob(jobId) {
        const job = await this.store.repo.getJob(jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${jobId} not found`);
        }
        return job;
    }
    async getJobResult(jobId, response) {
        const job = await this.store.repo.getJob(jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${jobId} not found`);
        }
        if (job.status === 'FAILED') {
            response.status(common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            return {
                jobId,
                status: job.status,
                message: 'Job processing failed',
                errorCode: job.errorCode,
                errorMessage: job.errorMessage
            };
        }
        if (job.status !== 'COMPLETED') {
            response.status(common_1.HttpStatus.ACCEPTED);
            return {
                jobId,
                status: job.status,
                message: 'Result is not ready yet',
                progress: this.statusToProgress(job.status),
                recommendedPollIntervalMs: this.env.JOB_RESULT_POLL_INTERVAL_MS,
                expectedMaxProcessingMs: this.env.JOB_EXPECTED_MAX_PROCESSING_MS
            };
        }
        return {
            jobId: job.jobId,
            lectureId: job.lectureId,
            status: job.status,
            transcriptPath: job.transcriptPath,
            transcriptText: job.transcriptText,
            transcript: job.transcriptJson ? JSON.parse(job.transcriptJson) : null,
            highlightsPath: job.highlightsPath,
            highlights: job.highlightsJson ? JSON.parse(job.highlightsJson) : null,
            summaryPath: job.summaryPath,
            summary: job.summaryJson ? JSON.parse(job.summaryJson) : null,
            flashcardsPath: job.flashcardsPath,
            flashcards: job.flashcardsJson ? JSON.parse(job.flashcardsJson) : null
        };
    }
    async getFullTranscript(jobId, response) {
        const job = await this.store.repo.getJob(jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${jobId} not found`);
        }
        if (job.status === 'FAILED') {
            response.status(common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            return {
                jobId,
                status: job.status,
                message: 'Job processing failed',
                errorCode: job.errorCode,
                errorMessage: job.errorMessage
            };
        }
        if (!job.transcriptJson) {
            response.status(common_1.HttpStatus.ACCEPTED);
            return {
                jobId,
                status: job.status,
                message: 'Transcript is not ready yet'
            };
        }
        return {
            jobId,
            lectureId: job.lectureId,
            transcript: JSON.parse(job.transcriptJson)
        };
    }
    async generateTranscriptHighlights(jobId, response) {
        const result = await this.requestHighlightsGeneration(jobId);
        response.status(common_1.HttpStatus.ACCEPTED);
        return result;
    }
    async getTranscriptHighlights(jobId, response) {
        const job = await this.store.repo.getJob(jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${jobId} not found`);
        }
        if (job.status === 'FAILED') {
            response.status(common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            return {
                jobId,
                status: job.status,
                message: 'Job processing failed',
                errorCode: job.errorCode,
                errorMessage: job.errorMessage
            };
        }
        if (!job.highlightsJson) {
            response.status(common_1.HttpStatus.ACCEPTED);
            return {
                jobId,
                status: job.status,
                message: 'Transcript highlights are not ready yet'
            };
        }
        return {
            jobId,
            lectureId: job.lectureId,
            highlights: JSON.parse(job.highlightsJson)
        };
    }
    async generateLectureSummary(jobId, response) {
        const result = await this.requestSummaryGeneration(jobId);
        response.status(common_1.HttpStatus.ACCEPTED);
        return result;
    }
    async getLectureSummary(jobId, response) {
        const job = await this.store.repo.getJob(jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${jobId} not found`);
        }
        if (job.status === 'FAILED') {
            response.status(common_1.HttpStatus.UNPROCESSABLE_ENTITY);
            return {
                jobId,
                status: job.status,
                message: 'Job processing failed',
                errorCode: job.errorCode,
                errorMessage: job.errorMessage
            };
        }
        if (!job.summaryJson) {
            response.status(common_1.HttpStatus.ACCEPTED);
            return {
                jobId,
                status: job.status,
                message: 'Summary is not ready yet'
            };
        }
        return {
            jobId,
            lectureId: job.lectureId,
            summary: JSON.parse(job.summaryJson)
        };
    }
    async askMaterialAssistant(body) {
        const job = await this.store.repo.getJob(body.jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${body.jobId} not found`);
        }
        if (!job.transcriptText) {
            throw new common_1.ConflictException('Transcript is not ready yet');
        }
        const history = await this.store.repo.getAssistantHistory(body.jobId, body.sessionId, 12);
        await this.store.repo.appendAssistantMessage(body.jobId, body.sessionId, 'user', body.question);
        let result;
        try {
            result = await this.materialAssistant.ask({
                question: body.question,
                transcriptText: job.transcriptText,
                transcriptJson: job.transcriptJson,
                summaryJson: job.summaryJson,
                history
            });
        }
        catch (error) {
            const details = error instanceof Error ? error.message : String(error);
            const errorCode = error instanceof material_assistant_service_1.AssistantGenerationError
                ? error.code
                : 'ASSISTANT_AI_HTTP_ERROR';
            throw new common_1.ServiceUnavailableException({
                message: 'Assistant provider is temporarily unavailable',
                errorCode,
                details
            });
        }
        await this.store.repo.appendAssistantMessage(body.jobId, body.sessionId, 'assistant', result.answer);
        await this.store.repo.trimAssistantHistory(body.jobId, body.sessionId, 16);
        return {
            jobId: body.jobId,
            sessionId: body.sessionId,
            answer: result.answer,
            citations: result.citations,
            webSources: result.webSources,
            sources: {
                lecture: result.citations,
                web: result.webSources
            },
            confidence: result.confidence,
            reason: result.reason,
            refused: result.refused
        };
    }
    async generateAssistantRecapAudio(body) {
        const job = await this.store.repo.getJob(body.jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${body.jobId} not found`);
        }
        if (!job.transcriptText) {
            throw new common_1.ConflictException('Transcript is not ready yet');
        }
        const recapText = await this.generateRecapTextForSession(body.jobId, body.sessionId, job.transcriptText, job.summaryJson);
        let ttsResult;
        try {
            ttsResult = await this.assistantTts.synthesize({
                text: recapText,
                ttsModel: body.ttsModel,
                ttsVoiceId: body.ttsVoiceId
            });
        }
        catch (error) {
            const details = error instanceof Error ? error.message : String(error);
            const errorCode = error instanceof assistant_tts_service_1.AssistantTtsError
                ? error.code
                : 'ASSISTANT_TTS_HTTP_ERROR';
            throw new common_1.ServiceUnavailableException({
                message: 'TTS provider is temporarily unavailable',
                errorCode,
                details
            });
        }
        await this.store.repo.appendAssistantMessage(body.jobId, body.sessionId, 'assistant', recapText);
        await this.store.repo.trimAssistantHistory(body.jobId, body.sessionId, 16);
        return {
            jobId: body.jobId,
            sessionId: body.sessionId,
            recapText,
            audioBase64: ttsResult.audioBase64,
            audioMimeType: ttsResult.audioMimeType,
            ttsModel: ttsResult.model,
            chunks: ttsResult.chunks
        };
    }
    async streamAssistantRecapAudio(body, response) {
        const job = await this.store.repo.getJob(body.jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${body.jobId} not found`);
        }
        if (!job.transcriptText) {
            throw new common_1.ConflictException('Transcript is not ready yet');
        }
        const recapText = await this.generateRecapTextForSession(body.jobId, body.sessionId, job.transcriptText, job.summaryJson);
        let ttsResult;
        try {
            ttsResult = await this.assistantTts.synthesizeRaw({
                text: recapText,
                ttsModel: body.ttsModel,
                ttsVoiceId: body.ttsVoiceId
            });
        }
        catch (error) {
            const details = error instanceof Error ? error.message : String(error);
            const errorCode = error instanceof assistant_tts_service_1.AssistantTtsError
                ? error.code
                : 'ASSISTANT_TTS_HTTP_ERROR';
            throw new common_1.ServiceUnavailableException({
                message: 'TTS provider is temporarily unavailable',
                errorCode,
                details
            });
        }
        await this.store.repo.appendAssistantMessage(body.jobId, body.sessionId, 'assistant', recapText);
        await this.store.repo.trimAssistantHistory(body.jobId, body.sessionId, 16);
        const recapPreview = encodeURIComponent(recapText.slice(0, 320));
        response.setHeader('content-type', ttsResult.audioMimeType);
        response.setHeader('x-tts-model', ttsResult.model);
        response.setHeader('x-tts-chunks', String(ttsResult.chunks));
        response.setHeader('x-recap-preview', recapPreview);
        response.status(common_1.HttpStatus.OK);
        response.send(ttsResult.audioBuffer);
    }
    async generateFlashcards(jobId, body, response) {
        const result = await this.requestFlashcardsGeneration(jobId, body.count);
        response.status(common_1.HttpStatus.ACCEPTED);
        return result;
    }
    async generateFlashcardsByJobId(body, response) {
        const result = await this.requestFlashcardsGeneration(body.jobId, body.count);
        response.status(common_1.HttpStatus.ACCEPTED);
        return result;
    }
    async requestFlashcardsGeneration(jobId, count) {
        const job = await this.store.repo.getJob(jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${jobId} not found`);
        }
        if (job.status === 'FAILED') {
            throw new common_1.ConflictException('Cannot generate flashcards for failed job');
        }
        if (!job.transcriptText) {
            throw new common_1.ConflictException('Transcript is not ready yet');
        }
        if (job.status === 'GENERATING_FLASHCARDS') {
            throw new common_1.ConflictException('Flashcards generation already in progress');
        }
        try {
            await this.store.repo.updateStatus(jobId, 'GENERATING_FLASHCARDS');
            await this.queueService.enqueueFlashcard({
                jobId,
                lectureId: job.lectureId,
                transcriptText: job.transcriptText,
                maxCards: count
            });
        }
        catch (error) {
            await this.store.repo.updateStatus(jobId, 'COMPLETED');
            const message = error instanceof Error ? error.message : String(error);
            throw new common_1.ServiceUnavailableException(`Flashcards queue unavailable: ${message}`);
        }
        return {
            jobId,
            status: 'GENERATING_FLASHCARDS',
            requestedCards: count
        };
    }
    async generateRecapTextForSession(jobId, sessionId, transcriptText, summaryJson) {
        const history = await this.store.repo.getAssistantHistory(jobId, sessionId, 12);
        await this.store.repo.appendAssistantMessage(jobId, sessionId, 'user', 'Сделай полный пересказ лекции и озвучь его');
        try {
            const recap = await this.materialAssistant.retellTranscript({
                transcriptText,
                summaryJson,
                history
            });
            return recap.recapText;
        }
        catch (error) {
            const details = error instanceof Error ? error.message : String(error);
            const errorCode = error instanceof material_assistant_service_1.AssistantGenerationError
                ? error.code
                : 'ASSISTANT_AI_HTTP_ERROR';
            throw new common_1.ServiceUnavailableException({
                message: 'Assistant provider is temporarily unavailable',
                errorCode,
                details
            });
        }
    }
    async requestHighlightsGeneration(jobId) {
        const job = await this.store.repo.getJob(jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${jobId} not found`);
        }
        if (job.status === 'FAILED') {
            throw new common_1.ConflictException('Cannot generate highlights for failed job');
        }
        if (!this.isAudioVideoJob(job)) {
            throw new common_1.ConflictException('Highlights are available only for audio/video files');
        }
        if (!job.transcriptJson) {
            throw new common_1.ConflictException('Transcript is not ready yet');
        }
        if (job.status === 'GENERATING_HIGHLIGHTS') {
            throw new common_1.ConflictException('Highlights generation already in progress');
        }
        try {
            await this.store.repo.updateStatus(jobId, 'GENERATING_HIGHLIGHTS');
            await this.queueService.enqueueHighlights({
                jobId,
                lectureId: job.lectureId,
                transcriptJson: job.transcriptJson
            });
        }
        catch (error) {
            await this.store.repo.updateStatus(jobId, 'COMPLETED');
            const message = error instanceof Error ? error.message : String(error);
            throw new common_1.ServiceUnavailableException(`Highlights queue unavailable: ${message}`);
        }
        return {
            jobId,
            status: 'GENERATING_HIGHLIGHTS'
        };
    }
    async requestSummaryGeneration(jobId) {
        const job = await this.store.repo.getJob(jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${jobId} not found`);
        }
        if (!job.transcriptText) {
            if (job.status === 'FAILED') {
                throw new common_1.ConflictException('Cannot generate summary: job failed before transcript was produced');
            }
            throw new common_1.ConflictException('Transcript is not ready yet');
        }
        if (job.status === 'GENERATING_SUMMARY') {
            throw new common_1.ConflictException('Summary generation already in progress');
        }
        const transcript = job.transcriptJson ? JSON.parse(job.transcriptJson) : {};
        const durationSecRaw = Number(transcript.duration ?? 0);
        const durationSec = Number.isFinite(durationSecRaw) ? Math.max(0, Math.floor(durationSecRaw)) : 0;
        try {
            await this.store.repo.updateStatus(jobId, 'GENERATING_SUMMARY');
            await this.queueService.enqueueSummary({
                jobId,
                lectureId: job.lectureId,
                filename: job.filename || `Lecture ${job.lectureId}`,
                transcriptText: job.transcriptText,
                durationSec
            });
        }
        catch (error) {
            await this.store.repo.updateStatus(jobId, 'COMPLETED');
            const message = error instanceof Error ? error.message : String(error);
            throw new common_1.ServiceUnavailableException(`Summary queue unavailable: ${message}`);
        }
        return {
            jobId,
            status: 'GENERATING_SUMMARY'
        };
    }
    statusToProgress(status) {
        const map = {
            QUEUED: 5,
            INGESTING: 20,
            INGESTED: 35,
            TRANSCRIBING: 55,
            GENERATING_HIGHLIGHTS: 75,
            GENERATING_SUMMARY: 80,
            GENERATING_FLASHCARDS: 85,
            COMPLETED: 100,
            FAILED: 100
        };
        return map[status] ?? 0;
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
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        limits: {
            fileSize: Number(process.env.UPLOAD_MAX_FILE_SIZE_BYTES || 200 * 1024 * 1024)
        }
    })),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(create_ingestion_request_schema_1.CreateIngestionRequestSchema)),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
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
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getJobResult", null);
__decorate([
    (0, common_1.Get)('/api/v1/jobs/:jobId/transcript'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getFullTranscript", null);
__decorate([
    (0, common_1.Post)('/api/v1/jobs/:jobId/highlights'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateTranscriptHighlights", null);
__decorate([
    (0, common_1.Get)('/api/v1/jobs/:jobId/highlights'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getTranscriptHighlights", null);
__decorate([
    (0, common_1.Post)('/api/v1/jobs/:jobId/summary'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateLectureSummary", null);
__decorate([
    (0, common_1.Get)('/api/v1/jobs/:jobId/summary'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getLectureSummary", null);
__decorate([
    (0, common_1.Post)('/api/v1/assistant/ask'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(assistant_ask_request_schema_1.AssistantAskRequestSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "askMaterialAssistant", null);
__decorate([
    (0, common_1.Post)('/api/v1/assistant/recap-audio'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(assistant_recap_request_schema_1.AssistantRecapRequestSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateAssistantRecapAudio", null);
__decorate([
    (0, common_1.Post)('/api/v1/assistant/recap-audio/stream'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(assistant_recap_request_schema_1.AssistantRecapRequestSchema))),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "streamAssistantRecapAudio", null);
__decorate([
    (0, common_1.Post)('/api/v1/jobs/:jobId/flashcards'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(generate_flashcards_request_schema_1.GenerateFlashcardsRequestSchema))),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateFlashcards", null);
__decorate([
    (0, common_1.Post)('/api/v1/flashcards/generate'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(generate_flashcards_by_job_request_schema_1.GenerateFlashcardsByJobRequestSchema))),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateFlashcardsByJobId", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object, queue_service_1.QueueService,
        job_store_service_1.JobStoreService,
        material_assistant_service_1.MaterialAssistantService,
        assistant_tts_service_1.AssistantTtsService])
], AppController);
//# sourceMappingURL=app.controller.js.map
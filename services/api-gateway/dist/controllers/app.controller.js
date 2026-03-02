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
var AppController_1;
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
const create_url_ingestion_request_schema_1 = require("../dto/create-url-ingestion-request.schema");
const create_video_ingestion_request_schema_1 = require("../dto/create-video-ingestion-request.schema");
const zod_validation_pipe_1 = require("../pipes/zod-validation.pipe");
const generate_flashcards_request_schema_1 = require("../dto/generate-flashcards-request.schema");
const generate_flashcards_by_job_request_schema_1 = require("../dto/generate-flashcards-by-job-request.schema");
const generate_quiz_request_schema_1 = require("../dto/generate-quiz-request.schema");
const check_quiz_answers_request_schema_1 = require("../dto/check-quiz-answers-request.schema");
const assistant_ask_request_schema_1 = require("../dto/assistant-ask-request.schema");
const assistant_recap_request_schema_1 = require("../dto/assistant-recap-request.schema");
const assistant_tts_preview_request_schema_1 = require("../dto/assistant-tts-preview-request.schema");
const material_assistant_service_1 = require("../services/material-assistant.service");
const assistant_tts_service_1 = require("../services/assistant-tts.service");
const material_quiz_service_1 = require("../services/material-quiz.service");
const public_decorator_1 = require("../auth/public.decorator");
let AppController = AppController_1 = class AppController {
    constructor(env, queueService, store, materialAssistant, assistantTts, materialQuiz) {
        this.env = env;
        this.queueService = queueService;
        this.store = store;
        this.materialAssistant = materialAssistant;
        this.assistantTts = assistantTts;
        this.materialQuiz = materialQuiz;
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
    async createIngestionJob(parsed, file, request) {
        const fileBase64 = file?.buffer?.toString('base64') ?? parsed.fileBase64;
        return this.createIngestionJobInternal(parsed, fileBase64, request);
    }
    async createUrlIngestionJob(parsed, request) {
        const payload = {
            sourceType: 'url',
            sourceUrl: parsed.sourceUrl,
            filename: this.filenameFromUrl(parsed.sourceUrl),
            mimeType: 'text/plain',
            requestedLanguage: parsed.requestedLanguage ?? 'ru'
        };
        return this.createIngestionJobInternal(payload, undefined, request);
    }
    async createVideoIngestionJob(parsed, request) {
        const payload = {
            sourceType: 'video_url',
            sourceUrl: parsed.sourceUrl,
            filename: this.filenameFromUrl(parsed.sourceUrl),
            mimeType: 'application/octet-stream',
            requestedLanguage: parsed.requestedLanguage ?? 'ru'
        };
        return this.createIngestionJobInternal(payload, undefined, request);
    }
    async createIngestionJobInternal(parsed, fileBase64, request) {
        const currentUser = this.getCurrentUser(request);
        if (parsed.sourceType === 'upload' && !fileBase64) {
            throw new common_1.BadRequestException('file is required for upload sourceType');
        }
        if ((parsed.sourceType === 'url' || parsed.sourceType === 'video_url') && !parsed.sourceUrl) {
            throw new common_1.BadRequestException('sourceUrl is required for url/video_url sourceType');
        }
        if (parsed.sourceType === 'upload') {
            const requiredFileBase64 = fileBase64 ?? '';
            this.assertSupportedUpload(parsed.filename, parsed.mimeType, requiredFileBase64);
        }
        const activeJob = await this.store.repo.getActiveJobForUser(currentUser.sub);
        if (activeJob) {
            throw new common_1.ConflictException(`Another lecture is still processing (jobId=${activeJob.jobId}, status=${activeJob.status}). Wait until it is COMPLETED or FAILED.`);
        }
        const lectureId = (0, node_crypto_1.randomUUID)();
        const jobId = (0, node_crypto_1.randomUUID)();
        try {
            await this.store.repo.createJob({
                jobId,
                lectureId,
                ownerUserId: currentUser.sub,
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
    filenameFromUrl(sourceUrl) {
        const parsed = new URL(sourceUrl);
        const host = parsed.hostname.replace(/[^a-zA-Z0-9.-]/g, '_') || 'website';
        return `${host}.txt`;
    }
    assertSupportedUpload(filename, mimeType, fileBase64) {
        const ext = node_path_1.default.extname(String(filename || '')).toLowerCase();
        const mime = String(mimeType || '').toLowerCase();
        const normalizedFilename = String(filename || '').trim();
        if (!normalizedFilename) {
            throw new common_1.BadRequestException('filename is required for upload sourceType');
        }
        if (normalizedFilename.length > AppController_1.MAX_FILENAME_LENGTH) {
            throw new common_1.BadRequestException(`filename is too long. Max length is ${AppController_1.MAX_FILENAME_LENGTH} characters`);
        }
        if (node_path_1.default.basename(normalizedFilename) !== normalizedFilename || normalizedFilename.includes('\0')) {
            throw new common_1.BadRequestException('filename must not contain path separators or null bytes');
        }
        const allowedMimePrefixes = ['audio/', 'video/'];
        const allowedMimeSet = new Set([
            'application/pdf',
            'text/plain',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        ]);
        const allowedExt = new Set([
            '.mp3',
            '.wav',
            '.m4a',
            '.ogg',
            '.aac',
            '.flac',
            '.mp4',
            '.mov',
            '.mkv',
            '.webm',
            '.pdf',
            '.txt',
            '.pptx'
        ]);
        const expectedMimeByExt = {
            '.pdf': ['application/pdf'],
            '.txt': ['text/plain'],
            '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation']
        };
        const mimeOk = mime.length === 0 ||
            allowedMimePrefixes.some((prefix) => mime.startsWith(prefix)) ||
            allowedMimeSet.has(mime);
        const extOk = allowedExt.has(ext);
        if (!mimeOk && !extOk) {
            throw new common_1.BadRequestException('Unsupported file type. Allowed: audio/video, PDF, TXT, PPTX');
        }
        if (ext in expectedMimeByExt && mime.length > 0 && !expectedMimeByExt[ext].includes(mime)) {
            throw new common_1.BadRequestException(`mimeType ${mimeType} does not match filename extension ${ext}`);
        }
        const normalizedBase64 = this.normalizeBase64(fileBase64);
        const maxBase64Length = this.maxBase64Length(this.env.UPLOAD_MAX_FILE_SIZE_BYTES);
        if (normalizedBase64.length > maxBase64Length) {
            throw new common_1.BadRequestException('Encoded file payload is too large');
        }
        const decoded = this.decodeStrictBase64(normalizedBase64);
        if (decoded.byteLength < AppController_1.FILE_SIGNATURE_MIN_BYTES) {
            throw new common_1.BadRequestException('Uploaded file is too small or empty');
        }
        if (decoded.byteLength > this.env.UPLOAD_MAX_FILE_SIZE_BYTES) {
            throw new common_1.BadRequestException(`Uploaded file exceeds max size ${this.env.UPLOAD_MAX_FILE_SIZE_BYTES} bytes`);
        }
    }
    normalizeBase64(payload) {
        const value = String(payload || '').trim();
        if (!value) {
            throw new common_1.BadRequestException('fileBase64 must be a non-empty base64 string');
        }
        const marker = 'base64,';
        const markerIndex = value.indexOf(marker);
        const raw = markerIndex >= 0 ? value.slice(markerIndex + marker.length) : value;
        const normalized = raw.replace(/\s+/g, '');
        if (!normalized) {
            throw new common_1.BadRequestException('fileBase64 must contain encoded data');
        }
        return normalized;
    }
    decodeStrictBase64(payload) {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 !== 0) {
            throw new common_1.BadRequestException('fileBase64 is not valid base64');
        }
        const decoded = Buffer.from(payload, 'base64');
        if (!decoded.byteLength) {
            throw new common_1.BadRequestException('Uploaded file is empty');
        }
        const normalizedDecoded = decoded.toString('base64').replace(/=+$/, '');
        const normalizedInput = payload.replace(/=+$/, '');
        if (normalizedDecoded !== normalizedInput) {
            throw new common_1.BadRequestException('fileBase64 is not valid base64');
        }
        return decoded;
    }
    maxBase64Length(maxBytes) {
        // Base64 expands payload size by ~4/3 (+ small padding).
        return Math.ceil((maxBytes * 4) / 3) + 8;
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
    async getJob(jobId, request) {
        const currentUser = this.getCurrentUser(request);
        const job = await this.getOwnedJobOrThrow(jobId, currentUser);
        return job;
    }
    async listUserJobs(limitRaw, request) {
        const currentUser = this.getCurrentUser(request);
        const parsedLimit = Number(limitRaw ?? 20);
        const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, Math.floor(parsedLimit))) : 20;
        const items = await this.store.repo.listJobsForUser(currentUser.sub, limit);
        return {
            items,
            count: items.length,
            limit
        };
    }
    async getJobResult(jobId, response, request) {
        const currentUser = this.getCurrentUser(request);
        const job = await this.getOwnedJobOrThrow(jobId, currentUser);
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
            flashcards: job.flashcardsJson ? JSON.parse(job.flashcardsJson) : null,
            quiz: this.safePublicQuiz(job.quizJson)
        };
    }
    async getFullTranscript(jobId, response, request) {
        const currentUser = this.getCurrentUser(request);
        const job = await this.getOwnedJobOrThrow(jobId, currentUser);
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
    async generateTranscriptHighlights(jobId, response, request) {
        const currentUser = this.getCurrentUser(request);
        const result = await this.requestHighlightsGeneration(jobId, currentUser);
        response.status(common_1.HttpStatus.ACCEPTED);
        return result;
    }
    async getTranscriptHighlights(jobId, response, request) {
        const currentUser = this.getCurrentUser(request);
        const job = await this.getOwnedJobOrThrow(jobId, currentUser);
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
    async generateLectureSummary(jobId, response, request) {
        const currentUser = this.getCurrentUser(request);
        const result = await this.requestSummaryGeneration(jobId, currentUser);
        response.status(common_1.HttpStatus.ACCEPTED);
        return result;
    }
    async getLectureSummary(jobId, response, request) {
        const currentUser = this.getCurrentUser(request);
        const job = await this.getOwnedJobOrThrow(jobId, currentUser);
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
    async askMaterialAssistant(body, request) {
        const currentUser = this.getCurrentUser(request);
        const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
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
    async generateAssistantRecapAudio(body, request) {
        const currentUser = this.getCurrentUser(request);
        const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
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
    async generateAssistantRecapText(body, request) {
        const currentUser = this.getCurrentUser(request);
        const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
        if (!job.transcriptText) {
            throw new common_1.ConflictException('Transcript is not ready yet');
        }
        const recapText = await this.generateRecapTextForSession(body.jobId, body.sessionId, job.transcriptText, job.summaryJson);
        await this.store.repo.appendAssistantMessage(body.jobId, body.sessionId, 'assistant', recapText);
        await this.store.repo.trimAssistantHistory(body.jobId, body.sessionId, 16);
        return {
            jobId: body.jobId,
            sessionId: body.sessionId,
            recapText
        };
    }
    async streamAssistantRecapAudio(body, response, request) {
        const currentUser = this.getCurrentUser(request);
        const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
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
    async listAssistantTtsVoices() {
        try {
            return await this.assistantTts.listVoices('ru');
        }
        catch (error) {
            const details = error instanceof Error ? error.message : String(error);
            const errorCode = error instanceof assistant_tts_service_1.AssistantTtsError
                ? error.code
                : 'ASSISTANT_TTS_HTTP_ERROR';
            throw new common_1.ServiceUnavailableException({
                message: 'TTS voices are temporarily unavailable',
                errorCode,
                details
            });
        }
    }
    async streamAssistantTtsPreview(body, response) {
        const previewText = String(body.text || '').trim() ||
            'Привет. Это пример выбранного голоса. Если звучание подходит, можно использовать его для озвучки пересказа.';
        let ttsResult;
        try {
            ttsResult = await this.assistantTts.synthesizeRaw({
                text: previewText,
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
                message: 'TTS preview is temporarily unavailable',
                errorCode,
                details
            });
        }
        response.setHeader('content-type', ttsResult.audioMimeType);
        response.setHeader('x-tts-model', ttsResult.model);
        response.setHeader('x-tts-chunks', String(ttsResult.chunks));
        response.status(common_1.HttpStatus.OK);
        response.send(ttsResult.audioBuffer);
    }
    async generateAssistantRecapAudioKaraoke(body, request) {
        const currentUser = this.getCurrentUser(request);
        const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
        if (!job.transcriptText) {
            throw new common_1.ConflictException('Transcript is not ready yet');
        }
        const recapText = await this.generateRecapTextForSession(body.jobId, body.sessionId, job.transcriptText, job.summaryJson);
        let ttsResult;
        try {
            ttsResult = await this.assistantTts.synthesizeWithTimestamps({
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
                message: 'TTS karaoke is temporarily unavailable',
                errorCode,
                details
            });
        }
        return {
            jobId: body.jobId,
            sessionId: body.sessionId,
            recapText,
            audioBase64: ttsResult.audioBase64,
            audioMimeType: ttsResult.audioMimeType,
            ttsModel: ttsResult.model,
            chunks: ttsResult.chunks,
            words: ttsResult.words
        };
    }
    async generateFlashcards(jobId, body, response, request) {
        const currentUser = this.getCurrentUser(request);
        const result = await this.requestFlashcardsGeneration(jobId, body.count, currentUser);
        response.status(common_1.HttpStatus.ACCEPTED);
        return result;
    }
    async generateFlashcardsByJobId(body, response, request) {
        const currentUser = this.getCurrentUser(request);
        const result = await this.requestFlashcardsGeneration(body.jobId, body.count, currentUser);
        response.status(common_1.HttpStatus.ACCEPTED);
        return result;
    }
    async generateMaterialQuiz(body, request) {
        const currentUser = this.getCurrentUser(request);
        const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
        if (!job.transcriptText) {
            throw new common_1.ConflictException('Transcript is not ready yet');
        }
        try {
            const quiz = await this.materialQuiz.generateQuiz({
                lectureId: job.lectureId,
                transcriptText: job.transcriptText,
                transcriptJson: job.transcriptJson,
                count: body.count,
                difficulty: body.difficulty,
                language: body.language
            });
            await this.store.repo.saveQuiz(body.jobId, JSON.stringify(quiz));
            return {
                jobId: body.jobId,
                quiz: this.materialQuiz.toPublicQuiz(quiz)
            };
        }
        catch (error) {
            const details = error instanceof Error ? error.message : String(error);
            const errorCode = error instanceof material_quiz_service_1.QuizGenerationError
                ? error.code
                : 'QUIZ_AI_HTTP_ERROR';
            throw new common_1.ServiceUnavailableException({
                message: 'Quiz provider is temporarily unavailable',
                errorCode,
                details
            });
        }
    }
    async checkMaterialQuiz(body, request) {
        const currentUser = this.getCurrentUser(request);
        const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
        if (!job.quizJson) {
            throw new common_1.ConflictException('Quiz is not generated yet');
        }
        let quiz;
        try {
            quiz = this.materialQuiz.parseStoredQuiz(job.quizJson);
        }
        catch {
            throw new common_1.ConflictException('Stored quiz payload is invalid');
        }
        const answers = this.materialQuiz.parseAnswers(body.answers);
        const evaluation = this.materialQuiz.gradeQuiz(quiz, answers);
        return {
            jobId: body.jobId,
            score: {
                total: evaluation.total,
                correct: evaluation.correct,
                percentage: evaluation.percentage
            },
            results: evaluation.results
        };
    }
    async getMaterialQuizStats(body, request) {
        const currentUser = this.getCurrentUser(request);
        const job = await this.getOwnedJobOrThrow(body.jobId, currentUser);
        if (!job.quizJson) {
            throw new common_1.ConflictException('Quiz is not generated yet');
        }
        let quiz;
        try {
            quiz = this.materialQuiz.parseStoredQuiz(job.quizJson);
        }
        catch {
            throw new common_1.ConflictException('Stored quiz payload is invalid');
        }
        const answers = this.materialQuiz.parseAnswers(body.answers);
        const evaluation = this.materialQuiz.gradeQuiz(quiz, answers);
        const stats = this.materialQuiz.buildFinalStats(quiz, evaluation);
        return {
            jobId: body.jobId,
            score: stats.score,
            answered: stats.answered,
            wrongCount: stats.wrongCount,
            needsWork: stats.needsWork,
            results: evaluation.results
        };
    }
    async requestFlashcardsGeneration(jobId, count, currentUser) {
        const job = await this.getOwnedJobOrThrow(jobId, currentUser);
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
    async requestHighlightsGeneration(jobId, currentUser) {
        const job = await this.getOwnedJobOrThrow(jobId, currentUser);
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
    async requestSummaryGeneration(jobId, currentUser) {
        const job = await this.getOwnedJobOrThrow(jobId, currentUser);
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
    safePublicQuiz(quizJson) {
        if (!quizJson) {
            return null;
        }
        try {
            return this.materialQuiz.toPublicQuiz(this.materialQuiz.parseStoredQuiz(quizJson));
        }
        catch {
            return null;
        }
    }
    getCurrentUser(request) {
        if (request?.user) {
            return request.user;
        }
        const isTestMode = process.env.NODE_ENV === 'test' || this.env.APP_ENV === 'test';
        if (!isTestMode) {
            throw new common_1.UnauthorizedException('Authorization token is required');
        }
        // Test fallback for direct controller unit tests that bypass Nest guards.
        return {
            sub: 'test-user',
            login: 'test',
            role: 'admin'
        };
    }
    async getOwnedJobOrThrow(jobId, currentUser) {
        const job = await this.store.repo.getJob(jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${jobId} not found`);
        }
        if (!job.ownerUserId) {
            if (currentUser.role !== 'admin') {
                throw new common_1.NotFoundException(`Job ${jobId} not found`);
            }
            return job;
        }
        if (job.ownerUserId !== currentUser.sub) {
            throw new common_1.NotFoundException(`Job ${jobId} not found`);
        }
        return job;
    }
};
exports.AppController = AppController;
AppController.MAX_FILENAME_LENGTH = 180;
AppController.FILE_SIGNATURE_MIN_BYTES = 4;
__decorate([
    (0, common_1.Get)('/health'),
    (0, public_decorator_1.Public)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('/ready'),
    (0, public_decorator_1.Public)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "ready", null);
__decorate([
    (0, common_1.Post)('/api/v1/lectures/ingest'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        limits: {
            fileSize: Number(process.env.UPLOAD_MAX_FILE_SIZE_BYTES || 100 * 1024 * 1024)
        }
    })),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(create_ingestion_request_schema_1.CreateIngestionRequestSchema)),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "createIngestionJob", null);
__decorate([
    (0, common_1.Post)('/api/v1/lectures/ingest-url'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(create_url_ingestion_request_schema_1.CreateUrlIngestionRequestSchema)),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "createUrlIngestionJob", null);
__decorate([
    (0, common_1.Post)('/api/v1/lectures/ingest-video'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(create_video_ingestion_request_schema_1.CreateVideoIngestionRequestSchema)),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "createVideoIngestionJob", null);
__decorate([
    (0, common_1.Get)('/api/v1/jobs/:jobId'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getJob", null);
__decorate([
    (0, common_1.Get)('/api/v1/jobs'),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "listUserJobs", null);
__decorate([
    (0, common_1.Get)('/api/v1/jobs/:jobId/result'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getJobResult", null);
__decorate([
    (0, common_1.Get)('/api/v1/jobs/:jobId/transcript'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getFullTranscript", null);
__decorate([
    (0, common_1.Post)('/api/v1/jobs/:jobId/highlights'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateTranscriptHighlights", null);
__decorate([
    (0, common_1.Get)('/api/v1/jobs/:jobId/highlights'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getTranscriptHighlights", null);
__decorate([
    (0, common_1.Post)('/api/v1/jobs/:jobId/summary'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateLectureSummary", null);
__decorate([
    (0, common_1.Get)('/api/v1/jobs/:jobId/summary'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getLectureSummary", null);
__decorate([
    (0, common_1.Post)('/api/v1/assistant/ask'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(assistant_ask_request_schema_1.AssistantAskRequestSchema))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "askMaterialAssistant", null);
__decorate([
    (0, common_1.Post)('/api/v1/assistant/recap-audio'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(assistant_recap_request_schema_1.AssistantRecapRequestSchema))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateAssistantRecapAudio", null);
__decorate([
    (0, common_1.Post)('/api/v1/assistant/recap'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(assistant_recap_request_schema_1.AssistantRecapRequestSchema))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateAssistantRecapText", null);
__decorate([
    (0, common_1.Post)('/api/v1/assistant/recap-audio/stream'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(assistant_recap_request_schema_1.AssistantRecapRequestSchema))),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "streamAssistantRecapAudio", null);
__decorate([
    (0, common_1.Get)('/api/v1/assistant/tts/voices'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "listAssistantTtsVoices", null);
__decorate([
    (0, common_1.Post)('/api/v1/assistant/tts-preview/stream'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(assistant_tts_preview_request_schema_1.AssistantTtsPreviewRequestSchema))),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "streamAssistantTtsPreview", null);
__decorate([
    (0, common_1.Post)('/api/v1/assistant/recap-audio/karaoke'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(assistant_recap_request_schema_1.AssistantRecapRequestSchema))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateAssistantRecapAudioKaraoke", null);
__decorate([
    (0, common_1.Post)('/api/v1/jobs/:jobId/flashcards'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(generate_flashcards_request_schema_1.GenerateFlashcardsRequestSchema))),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateFlashcards", null);
__decorate([
    (0, common_1.Post)('/api/v1/flashcards/generate'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(generate_flashcards_by_job_request_schema_1.GenerateFlashcardsByJobRequestSchema))),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateFlashcardsByJobId", null);
__decorate([
    (0, common_1.Post)('/api/v1/tests/generate'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(generate_quiz_request_schema_1.GenerateQuizRequestSchema))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateMaterialQuiz", null);
__decorate([
    (0, common_1.Post)('/api/v1/tests/check'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(check_quiz_answers_request_schema_1.CheckQuizAnswersRequestSchema))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "checkMaterialQuiz", null);
__decorate([
    (0, common_1.Post)('/api/v1/tests/stats'),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(check_quiz_answers_request_schema_1.CheckQuizAnswersRequestSchema))),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getMaterialQuizStats", null);
exports.AppController = AppController = AppController_1 = __decorate([
    (0, common_1.Controller)(),
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object, queue_service_1.QueueService,
        job_store_service_1.JobStoreService,
        material_assistant_service_1.MaterialAssistantService,
        assistant_tts_service_1.AssistantTtsService,
        material_quiz_service_1.MaterialQuizService])
], AppController);
//# sourceMappingURL=app.controller.js.map
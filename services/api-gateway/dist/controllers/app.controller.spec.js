"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const app_controller_1 = require("./app.controller");
const common_1 = require("@nestjs/common");
(0, node_test_1.describe)('AppController', () => {
    let controller;
    let mockQueueService;
    let mockJobStore;
    let mockEnv;
    mockEnv = {
        SERVICE_NAME: 'api-gateway',
        APP_ENV: 'test',
        REDIS_QUEUE_PREFIX: 'testq',
        JOB_RESULT_POLL_INTERVAL_MS: 2000,
        JOB_EXPECTED_MAX_PROCESSING_MS: 900000
    };
    mockQueueService = {
        enqueueIngestion: async () => { },
        enqueueFlashcard: async () => { },
        enqueueHighlights: async () => { },
        enqueueSummary: async () => { }
    };
    mockJobStore = {
        repo: {
            getActiveJob: async () => null,
            createJob: async () => { },
            updateStatus: async () => { },
            saveSummary: async () => { },
            getJob: async (id) => {
                if (id === '123')
                    return {
                        jobId: '123',
                        lectureId: 'l-123',
                        status: 'COMPLETED',
                        transcriptPath: '/path',
                        transcriptText: 'text',
                        transcriptJson: JSON.stringify({ duration: 10, text: 'text', segments: [{ start: 0, end: 1, text: 'text' }] }),
                        highlightsPath: '/h-path',
                        highlightsJson: JSON.stringify([{ start: 0, end: 5, text: 'важно', reason: 'ключевая идея' }]),
                        summaryPath: '/s-path',
                        summaryJson: JSON.stringify({ source_metadata: { title: 't', duration: '00:00:10', reading_time: '1 min' }, one_sentence_pitch: 'pitch', top_takeaways: ['a', 'b', 'c'], timeline: [{ period: '00:00 - 00:10', topic: 'x', summary: 'y' }], entities: { people: [], locations: [], concepts: [] }, action_plan: ['z'] }),
                        flashcardsPath: null,
                        flashcardsJson: null
                    };
                if (id === '456')
                    return { jobId: '456', lectureId: 'l-456', status: 'QUEUED' };
                if (id === '789')
                    return { jobId: '789', status: 'FAILED', errorCode: 'X', errorMessage: 'boom' };
                return null;
            }
        }
    };
    controller = new app_controller_1.AppController(mockEnv, mockQueueService, mockJobStore);
    (0, node_test_1.test)('health endpoint returns config injected', () => {
        const res = controller.health();
        strict_1.default.strictEqual(res.status, 'ok');
        strict_1.default.strictEqual(res.service, 'api-gateway');
    });
    (0, node_test_1.test)('ready endpoint returns queues', () => {
        const res = controller.ready();
        strict_1.default.strictEqual(res.status, 'ready');
        strict_1.default.ok(res.queues);
    });
    (0, node_test_1.test)('createIngestionJob validates URL requirement', async () => {
        await strict_1.default.rejects(() => controller.createIngestionJob({ sourceType: 'url', requestedLanguage: 'ru' }), (e) => e instanceof common_1.BadRequestException);
    });
    (0, node_test_1.test)('createIngestionJob validates File requirement', async () => {
        await strict_1.default.rejects(() => controller.createIngestionJob({ sourceType: 'upload', requestedLanguage: 'ru' }), (e) => e instanceof common_1.BadRequestException);
    });
    (0, node_test_1.test)('createIngestionJob accepts multipart upload file', async () => {
        let queuePayload;
        mockQueueService.enqueueIngestion = async (payload) => {
            queuePayload = payload;
        };
        const res = await controller.createIngestionJob({ sourceType: 'upload', requestedLanguage: 'ru', filename: 'lecture.mp3', mimeType: 'audio/mpeg' }, { buffer: Buffer.from('hello-audio') });
        strict_1.default.ok(res.jobId);
        strict_1.default.strictEqual(res.status, 'QUEUED');
        strict_1.default.strictEqual(queuePayload.sourceType, 'upload');
        strict_1.default.strictEqual(queuePayload.fileBase64, Buffer.from('hello-audio').toString('base64'));
    });
    (0, node_test_1.test)('createIngestionJob marks job failed when enqueue errors', async () => {
        let setErrorCalled = false;
        mockQueueService.enqueueIngestion = async () => { throw new Error('redis down'); };
        mockJobStore.repo.setError = async () => { setErrorCalled = true; };
        await strict_1.default.rejects(() => controller.createIngestionJob({ sourceType: 'url', sourceUrl: 'http://test.com', requestedLanguage: 'ru', filename: '1.mp3', mimeType: 'audio/mpeg' }), (e) => e instanceof common_1.ServiceUnavailableException);
        strict_1.default.equal(setErrorCalled, true);
    });
    (0, node_test_1.test)('getJobResult returns transcript on COMPLETED', async () => {
        const mockResponse = { status: () => mockResponse };
        const res = await controller.getJobResult('123', mockResponse);
        strict_1.default.strictEqual(res.transcriptText, 'text');
        strict_1.default.strictEqual(res.status, 'COMPLETED');
        strict_1.default.ok(Array.isArray(res.highlights));
        strict_1.default.ok(res.summary);
    });
    (0, node_test_1.test)('getJobResult throws NotFound on unknown job', async () => {
        const mockResponse = { status: () => mockResponse };
        await strict_1.default.rejects(() => controller.getJobResult('unknown', mockResponse), (e) => e instanceof common_1.NotFoundException);
    });
    (0, node_test_1.test)('getJobResult returns pending status if NOT COMPLETED', async () => {
        let statusCode;
        const mockResponse = {
            status: (code) => {
                statusCode = code;
                return mockResponse;
            }
        };
        const res = await controller.getJobResult('456', mockResponse);
        strict_1.default.strictEqual(res.status, 'QUEUED');
        strict_1.default.strictEqual(statusCode, 202);
        strict_1.default.strictEqual(res.progress, 5);
    });
    (0, node_test_1.test)('getTranscriptHighlights returns ready highlights', async () => {
        const mockResponse = { status: () => mockResponse };
        const res = await controller.getTranscriptHighlights('123', mockResponse);
        strict_1.default.equal(Array.isArray(res.highlights), true);
    });
    (0, node_test_1.test)('generateTranscriptHighlights enqueues request', async () => {
        let statusCode;
        let payload;
        const mockResponse = { status: (code) => { statusCode = code; return mockResponse; } };
        mockQueueService.enqueueHighlights = async (p) => { payload = p; };
        const res = await controller.generateTranscriptHighlights('123', mockResponse);
        strict_1.default.equal(statusCode, 202);
        strict_1.default.equal(res.status, 'GENERATING_HIGHLIGHTS');
        strict_1.default.equal(payload.jobId, '123');
    });
    (0, node_test_1.test)('getLectureSummary returns ready summary', async () => {
        const mockResponse = { status: () => mockResponse };
        const res = await controller.getLectureSummary('123', mockResponse);
        strict_1.default.equal(res.lectureId, 'l-123');
        strict_1.default.equal(typeof res.summary.one_sentence_pitch, 'string');
    });
    (0, node_test_1.test)('generateLectureSummary enqueues request', async () => {
        let statusCode;
        let payload;
        const mockResponse = { status: (code) => { statusCode = code; return mockResponse; } };
        mockQueueService.enqueueSummary = async (p) => { payload = p; };
        const res = await controller.generateLectureSummary('123', mockResponse);
        strict_1.default.equal(statusCode, 202);
        strict_1.default.equal(res.status, 'GENERATING_SUMMARY');
        strict_1.default.equal(payload.jobId, '123');
    });
    (0, node_test_1.test)('generateLectureSummary normalizes float duration to integer seconds', async () => {
        let payload;
        const mockResponse = { status: () => mockResponse };
        const originalGetJob = mockJobStore.repo.getJob;
        mockJobStore.repo.getJob = async (id) => {
            if (id !== 'flt')
                return originalGetJob(id);
            return {
                jobId: 'flt',
                lectureId: 'l-flt',
                status: 'COMPLETED',
                filename: 'float.mp3',
                transcriptText: 'text',
                transcriptJson: JSON.stringify({ duration: 5791.98, text: 'text', segments: [] })
            };
        };
        mockQueueService.enqueueSummary = async (p) => { payload = p; };
        await controller.generateLectureSummary('flt', mockResponse);
        strict_1.default.equal(payload.durationSec, 5791);
    });
    (0, node_test_1.test)('generateFlashcards enqueues generation request', async () => {
        let statusCode;
        let payload;
        const mockResponse = { status: (code) => { statusCode = code; return mockResponse; } };
        mockQueueService.enqueueFlashcard = async (p) => { payload = p; };
        const res = await controller.generateFlashcards('123', { count: 4 }, mockResponse);
        strict_1.default.equal(statusCode, 202);
        strict_1.default.equal(res.status, 'GENERATING_FLASHCARDS');
        strict_1.default.equal(payload.maxCards, 4);
    });
    (0, node_test_1.test)('generateFlashcards rejects when transcript is missing', async () => {
        mockJobStore.repo.getJob = async () => ({ jobId: '1', lectureId: 'l-1', status: 'QUEUED', transcriptText: null });
        const mockResponse = { status: () => mockResponse };
        await strict_1.default.rejects(() => controller.generateFlashcards('1', { count: 2 }, mockResponse), (e) => e instanceof common_1.ConflictException);
    });
});
//# sourceMappingURL=app.controller.spec.js.map
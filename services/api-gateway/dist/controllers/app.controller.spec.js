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
        enqueueIngestion: async () => { }
    };
    mockJobStore = {
        repo: {
            getActiveJob: async () => null,
            createJob: async () => { },
            getJob: async (id) => {
                if (id === '123')
                    return { jobId: '123', status: 'COMPLETED', transcriptPath: '/path', transcriptText: 'text' };
                if (id === '456')
                    return { jobId: '456', status: 'QUEUED' };
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
        try {
            await controller.createIngestionJob({ sourceType: 'url', requestedLanguage: 'ru' });
            strict_1.default.fail('Should fail without url');
        }
        catch (e) {
            strict_1.default.ok(e instanceof common_1.BadRequestException);
        }
    });
    (0, node_test_1.test)('createIngestionJob validates File requirement', async () => {
        try {
            await controller.createIngestionJob({ sourceType: 'upload', requestedLanguage: 'ru' });
            strict_1.default.fail('Should fail without file');
        }
        catch (e) {
            strict_1.default.ok(e instanceof common_1.BadRequestException);
        }
    });
    (0, node_test_1.test)('createIngestionJob passes with valid URL', async () => {
        const res = await controller.createIngestionJob({ sourceType: 'url', sourceUrl: 'http://test.com', requestedLanguage: 'ru', filename: '1.mp3', mimeType: 'audio/mpeg' });
        strict_1.default.ok(res.jobId);
        strict_1.default.strictEqual(res.status, 'QUEUED');
    });
    (0, node_test_1.test)('createIngestionJob marks job failed when enqueue errors', async () => {
        let setErrorCalled = false;
        mockQueueService.enqueueIngestion = async () => { throw new Error('redis down'); };
        mockJobStore.repo.setError = async () => { setErrorCalled = true; };
        try {
            await controller.createIngestionJob({ sourceType: 'url', sourceUrl: 'http://test.com', requestedLanguage: 'ru', filename: '1.mp3', mimeType: 'audio/mpeg' });
            strict_1.default.fail('Should fail on enqueue error');
        }
        catch (e) {
            strict_1.default.ok(e instanceof common_1.ServiceUnavailableException);
            strict_1.default.strictEqual(setErrorCalled, true);
        }
        finally {
            mockQueueService.enqueueIngestion = async () => { };
            mockJobStore.repo.setError = async () => { };
        }
    });
    (0, node_test_1.test)('createIngestionJob blocks when active job exists', async () => {
        mockJobStore.repo.getActiveJob = async () => ({ jobId: 'busy', status: 'INGESTING', lectureId: 'l1' });
        try {
            await controller.createIngestionJob({ sourceType: 'url', sourceUrl: 'http://test.com', requestedLanguage: 'ru', filename: '1.mp3', mimeType: 'audio/mpeg' });
            strict_1.default.fail('Should fail while active job exists');
        }
        catch (e) {
            strict_1.default.ok(e instanceof common_1.ConflictException);
        }
        finally {
            mockJobStore.repo.getActiveJob = async () => null;
        }
    });
    (0, node_test_1.test)('getJobResult returns transcript on COMPLETED', async () => {
        const mockResponse = { status: () => mockResponse };
        const res = await controller.getJobResult('123', mockResponse);
        strict_1.default.strictEqual(res.transcriptText, 'text');
    });
    (0, node_test_1.test)('getJobResult throws NotFound on unknown job', async () => {
        const mockResponse = { status: () => mockResponse };
        try {
            await controller.getJobResult('unknown', mockResponse);
            strict_1.default.fail('Should fail');
        }
        catch (e) {
            strict_1.default.ok(e instanceof common_1.NotFoundException);
        }
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
        strict_1.default.strictEqual(res.recommendedPollIntervalMs, 2000);
        strict_1.default.strictEqual(res.expectedMaxProcessingMs, 900000);
    });
    (0, node_test_1.test)('getJobResult returns failure payload for FAILED job', async () => {
        let statusCode;
        const mockResponse = {
            status: (code) => {
                statusCode = code;
                return mockResponse;
            }
        };
        const res = await controller.getJobResult('789', mockResponse);
        strict_1.default.strictEqual(res.status, 'FAILED');
        strict_1.default.strictEqual(statusCode, 422);
    });
});
//# sourceMappingURL=app.controller.spec.js.map
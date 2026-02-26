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
        REDIS_QUEUE_PREFIX: 'testq'
    };
    mockQueueService = {
        enqueueIngestion: async () => { }
    };
    mockJobStore = {
        repo: {
            createJob: async () => { },
            getJob: async (id) => {
                if (id === '123')
                    return { jobId: '123', status: 'COMPLETED', transcriptPath: '/path', transcriptText: 'text' };
                if (id === '456')
                    return { jobId: '456', status: 'QUEUED' };
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
    (0, node_test_1.test)('getJobResult returns transcript on COMPLETED', async () => {
        const res = await controller.getJobResult('123');
        strict_1.default.strictEqual(res.transcriptText, 'text');
    });
    (0, node_test_1.test)('getJobResult throws NotFound on unknown job', async () => {
        try {
            await controller.getJobResult('unknown');
            strict_1.default.fail('Should fail');
        }
        catch (e) {
            strict_1.default.ok(e instanceof common_1.NotFoundException);
        }
    });
    (0, node_test_1.test)('getJobResult returns pending status if NOT COMPLETED', async () => {
        const res = await controller.getJobResult('456');
        strict_1.default.strictEqual(res.status, 'QUEUED');
    });
});
//# sourceMappingURL=app.controller.spec.js.map
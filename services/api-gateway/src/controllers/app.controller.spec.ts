import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from './app.controller';
import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

describe('AppController', () => {
    let controller: AppController;
    let mockQueueService: any;
    let mockJobStore: any;
    let mockEnv: any;

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
            getJob: async (id: string) => {
                if (id === '123') return { jobId: '123', status: 'COMPLETED', transcriptPath: '/path', transcriptText: 'text' };
                if (id === '456') return { jobId: '456', status: 'QUEUED' };
                if (id === '789') return { jobId: '789', status: 'FAILED', errorCode: 'X', errorMessage: 'boom' };
                return null;
            }
        }
    };

    controller = new AppController(mockEnv, mockQueueService, mockJobStore);

    test('health endpoint returns config injected', () => {
        const res = controller.health();
        assert.strictEqual(res.status, 'ok');
        assert.strictEqual(res.service, 'api-gateway');
    });

    test('ready endpoint returns queues', () => {
        const res = controller.ready();
        assert.strictEqual(res.status, 'ready');
        assert.ok(res.queues);
    });

    test('createIngestionJob validates URL requirement', async () => {
        try {
            await controller.createIngestionJob({ sourceType: 'url', requestedLanguage: 'ru' });
            assert.fail('Should fail without url');
        } catch (e) {
            assert.ok(e instanceof BadRequestException);
        }
    });

    test('createIngestionJob validates File requirement', async () => {
        try {
            await controller.createIngestionJob({ sourceType: 'upload', requestedLanguage: 'ru' });
            assert.fail('Should fail without file');
        } catch (e) {
            assert.ok(e instanceof BadRequestException);
        }
    });

    test('createIngestionJob passes with valid URL', async () => {
        const res = await controller.createIngestionJob({ sourceType: 'url', sourceUrl: 'http://test.com', requestedLanguage: 'ru', filename: '1.mp3', mimeType: 'audio/mpeg' });
        assert.ok(res.jobId);
        assert.strictEqual(res.status, 'QUEUED');
    });

    test('createIngestionJob marks job failed when enqueue errors', async () => {
        let setErrorCalled = false;
        mockQueueService.enqueueIngestion = async () => { throw new Error('redis down'); };
        mockJobStore.repo.setError = async () => { setErrorCalled = true; };
        try {
            await controller.createIngestionJob({ sourceType: 'url', sourceUrl: 'http://test.com', requestedLanguage: 'ru', filename: '1.mp3', mimeType: 'audio/mpeg' });
            assert.fail('Should fail on enqueue error');
        } catch (e) {
            assert.ok(e instanceof ServiceUnavailableException);
            assert.strictEqual(setErrorCalled, true);
        } finally {
            mockQueueService.enqueueIngestion = async () => { };
            mockJobStore.repo.setError = async () => { };
        }
    });

    test('createIngestionJob blocks when active job exists', async () => {
        mockJobStore.repo.getActiveJob = async () => ({ jobId: 'busy', status: 'INGESTING', lectureId: 'l1' });
        try {
            await controller.createIngestionJob({ sourceType: 'url', sourceUrl: 'http://test.com', requestedLanguage: 'ru', filename: '1.mp3', mimeType: 'audio/mpeg' });
            assert.fail('Should fail while active job exists');
        } catch (e) {
            assert.ok(e instanceof ConflictException);
        } finally {
            mockJobStore.repo.getActiveJob = async () => null;
        }
    });

    test('getJobResult returns transcript on COMPLETED', async () => {
        const mockResponse: any = { status: () => mockResponse };
        const res = await controller.getJobResult('123', mockResponse);
        assert.strictEqual(res.transcriptText, 'text');
    });

    test('getJobResult throws NotFound on unknown job', async () => {
        const mockResponse: any = { status: () => mockResponse };
        try {
            await controller.getJobResult('unknown', mockResponse);
            assert.fail('Should fail');
        } catch (e) {
            assert.ok(e instanceof NotFoundException);
        }
    });

    test('getJobResult returns pending status if NOT COMPLETED', async () => {
        let statusCode: number | undefined;
        const mockResponse: any = {
            status: (code: number) => {
                statusCode = code;
                return mockResponse;
            }
        };
        const res = await controller.getJobResult('456', mockResponse);
        assert.strictEqual(res.status, 'QUEUED');
        assert.strictEqual(statusCode, 202);
        assert.strictEqual(res.progress, 5);
        assert.strictEqual(res.recommendedPollIntervalMs, 2000);
        assert.strictEqual(res.expectedMaxProcessingMs, 900000);
    });

    test('getJobResult returns failure payload for FAILED job', async () => {
        let statusCode: number | undefined;
        const mockResponse: any = {
            status: (code: number) => {
                statusCode = code;
                return mockResponse;
            }
        };
        const res = await controller.getJobResult('789', mockResponse);
        assert.strictEqual(res.status, 'FAILED');
        assert.strictEqual(statusCode, 422);
    });
});

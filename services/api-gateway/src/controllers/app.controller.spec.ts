import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from './app.controller';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('AppController', () => {
    let controller: AppController;
    let mockQueueService: any;
    let mockJobStore: any;
    let mockEnv: any;

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
            getJob: async (id: string) => {
                if (id === '123') return { jobId: '123', status: 'COMPLETED', transcriptPath: '/path', transcriptText: 'text' };
                if (id === '456') return { jobId: '456', status: 'QUEUED' };
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

    test('getJobResult returns transcript on COMPLETED', async () => {
        const res = await controller.getJobResult('123');
        assert.strictEqual(res.transcriptText, 'text');
    });

    test('getJobResult throws NotFound on unknown job', async () => {
        try {
            await controller.getJobResult('unknown');
            assert.fail('Should fail');
        } catch (e) {
            assert.ok(e instanceof NotFoundException);
        }
    });

    test('getJobResult returns pending status if NOT COMPLETED', async () => {
        const res = await controller.getJobResult('456');
        assert.strictEqual(res.status, 'QUEUED');
    });
});

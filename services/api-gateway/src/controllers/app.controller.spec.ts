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
            getJob: async (id: string) => {
                if (id === '123') return {
                    jobId: '123',
                    lectureId: 'l-123',
                    status: 'COMPLETED',
                    transcriptPath: '/path',
                    transcriptText: 'text',
                    transcriptJson: JSON.stringify({ duration: 10, text: 'text', segments: [{ start: 0, end: 1, text: 'text' }] }),
                    highlightsPath: '/h-path',
                    highlightsJson: JSON.stringify([{ start: 0, end: 5, text: 'важно', reason: 'ключевая идея' }]),
                    summaryPath: '/s-path',
                    summaryJson: JSON.stringify({ title: 't', duration: '00:00:10', smart_reading_time: '3 min', executive_summary: 'Очень краткая сводка по лекции и ее смыслу.', top_takeaways: ['a long enough takeaway', 'another meaningful takeaway', 'third meaningful takeaway'], material_insights: [{ kind: 'concept', title: 'Главная идея', importance: 'Показывает центральный тезис лекции.' }, { kind: 'example', title: 'Практический пример', importance: 'Позволяет применить идею на практике.' }, { kind: 'concept', title: 'Итоговый вывод', importance: 'Фиксирует финальную мысль лекции.' }], entities: { people: [], concepts: [] } }),
                    flashcardsPath: null,
                    flashcardsJson: null
                };
                if (id === '456') return { jobId: '456', lectureId: 'l-456', status: 'QUEUED' };
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
        await assert.rejects(
            () => controller.createIngestionJob({ sourceType: 'url', requestedLanguage: 'ru' }),
            (e) => e instanceof BadRequestException
        );
    });

    test('createIngestionJob validates File requirement', async () => {
        await assert.rejects(
            () => controller.createIngestionJob({ sourceType: 'upload', requestedLanguage: 'ru' }),
            (e) => e instanceof BadRequestException
        );
    });

    test('createIngestionJob accepts multipart upload file', async () => {
        let queuePayload: any;
        mockQueueService.enqueueIngestion = async (payload: any) => {
            queuePayload = payload;
        };

        const res = await controller.createIngestionJob(
            { sourceType: 'upload', requestedLanguage: 'ru', filename: 'lecture.mp3', mimeType: 'audio/mpeg' },
            { buffer: Buffer.from('hello-audio') } as any
        );

        assert.ok(res.jobId);
        assert.strictEqual(res.status, 'QUEUED');
        assert.strictEqual(queuePayload.sourceType, 'upload');
        assert.strictEqual(queuePayload.fileBase64, Buffer.from('hello-audio').toString('base64'));
    });

    test('createIngestionJob marks job failed when enqueue errors', async () => {
        let setErrorCalled = false;
        mockQueueService.enqueueIngestion = async () => { throw new Error('redis down'); };
        mockJobStore.repo.setError = async () => { setErrorCalled = true; };
        await assert.rejects(
            () => controller.createIngestionJob({ sourceType: 'url', sourceUrl: 'http://test.com', requestedLanguage: 'ru', filename: '1.mp3', mimeType: 'audio/mpeg' }),
            (e) => e instanceof ServiceUnavailableException
        );
        assert.equal(setErrorCalled, true);
    });

    test('getJobResult returns transcript on COMPLETED', async () => {
        const mockResponse: any = { status: () => mockResponse };
        const res = await controller.getJobResult('123', mockResponse);
        assert.strictEqual(res.transcriptText, 'text');
        assert.strictEqual(res.status, 'COMPLETED');
        assert.ok(Array.isArray(res.highlights));
        assert.ok(res.summary);
    });

    test('getJobResult throws NotFound on unknown job', async () => {
        const mockResponse: any = { status: () => mockResponse };
        await assert.rejects(() => controller.getJobResult('unknown', mockResponse), (e) => e instanceof NotFoundException);
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
    });

    test('getTranscriptHighlights returns ready highlights', async () => {
        const mockResponse: any = { status: () => mockResponse };
        const res = await controller.getTranscriptHighlights('123', mockResponse);
        assert.equal(Array.isArray(res.highlights), true);
    });

    test('generateTranscriptHighlights enqueues request', async () => {
        let statusCode: number | undefined;
        let payload: any;
        const mockResponse: any = { status: (code: number) => { statusCode = code; return mockResponse; } };
        mockQueueService.enqueueHighlights = async (p: any) => { payload = p; };
        const res = await controller.generateTranscriptHighlights('123', mockResponse);
        assert.equal(statusCode, 202);
        assert.equal(res.status, 'GENERATING_HIGHLIGHTS');
        assert.equal(payload.jobId, '123');
    });

    test('getLectureSummary returns ready summary', async () => {
        const mockResponse: any = { status: () => mockResponse };
        const res = await controller.getLectureSummary('123', mockResponse);
        assert.equal(res.lectureId, 'l-123');
        assert.equal(typeof res.summary.executive_summary, 'string');
    });

    test('generateLectureSummary enqueues request', async () => {
        let statusCode: number | undefined;
        let payload: any;
        const mockResponse: any = { status: (code: number) => { statusCode = code; return mockResponse; } };
        mockQueueService.enqueueSummary = async (p: any) => { payload = p; };
        const res = await controller.generateLectureSummary('123', mockResponse);
        assert.equal(statusCode, 202);
        assert.equal(res.status, 'GENERATING_SUMMARY');
        assert.equal(payload.jobId, '123');
    });

    test('generateLectureSummary normalizes float duration to integer seconds', async () => {
        let payload: any;
        const mockResponse: any = { status: () => mockResponse };
        const originalGetJob = mockJobStore.repo.getJob;
        mockJobStore.repo.getJob = async (id: string) => {
            if (id !== 'flt') return originalGetJob(id);
            return {
                jobId: 'flt',
                lectureId: 'l-flt',
                status: 'COMPLETED',
                filename: 'float.mp3',
                transcriptText: 'text',
                transcriptJson: JSON.stringify({ duration: 5791.98, text: 'text', segments: [] })
            };
        };
        mockQueueService.enqueueSummary = async (p: any) => { payload = p; };
        await controller.generateLectureSummary('flt', mockResponse);
        assert.equal(payload.durationSec, 5791);
    });

    test('generateFlashcards enqueues generation request', async () => {
        let statusCode: number | undefined;
        let payload: any;
        const mockResponse: any = { status: (code: number) => { statusCode = code; return mockResponse; } };
        mockQueueService.enqueueFlashcard = async (p: any) => { payload = p; };
        const res = await controller.generateFlashcards('123', { count: 4 }, mockResponse);
        assert.equal(statusCode, 202);
        assert.equal(res.status, 'GENERATING_FLASHCARDS');
        assert.equal(payload.maxCards, 4);
    });

    test('generateFlashcards rejects when transcript is missing', async () => {
        mockJobStore.repo.getJob = async () => ({ jobId: '1', lectureId: 'l-1', status: 'QUEUED', transcriptText: null });
        const mockResponse: any = { status: () => mockResponse };
        await assert.rejects(() => controller.generateFlashcards('1', { count: 2 }, mockResponse), (e) => e instanceof ConflictException);
    });
});

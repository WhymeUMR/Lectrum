import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from './app.controller';
import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

describe('AppController', () => {
    let controller: AppController;
    let mockQueueService: any;
    let mockJobStore: any;
    let mockEnv: any;
    let mockHighlightService: any;

    mockEnv = {
        SERVICE_NAME: 'api-gateway',
        APP_ENV: 'test',
        REDIS_QUEUE_PREFIX: 'testq',
        JOB_RESULT_POLL_INTERVAL_MS: 2000,
        JOB_EXPECTED_MAX_PROCESSING_MS: 900000
    };

    mockQueueService = {
        enqueueIngestion: async () => { },
        enqueueFlashcard: async () => { }
    };

    mockJobStore = {
        repo: {
            getActiveJob: async () => null,
            createJob: async () => { },
            updateStatus: async () => { },
            getJob: async (id: string) => {
                if (id === '123') return {
                    jobId: '123',
                    lectureId: 'l-123',
                    status: 'COMPLETED',
                    transcriptPath: '/path',
                    transcriptText: 'text',
                    transcriptJson: JSON.stringify({ text: 'text', segments: [{ start: 0, end: 1, text: 'text' }] }),
                    flashcardsPath: null,
                    flashcardsJson: null
                };
                if (id === '456') return { jobId: '456', status: 'QUEUED' };
                if (id === '789') return { jobId: '789', status: 'FAILED', errorCode: 'X', errorMessage: 'boom' };
                return null;
            }
        }
    };

    mockHighlightService = {
        getHighlights: async () => [{ start: 0, end: 1, text: 'text', reason: 'important' }]
    };

    controller = new AppController(mockEnv, mockQueueService, mockJobStore, mockHighlightService);

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
            assert.match((e as BadRequestException).message, /file is required/);
        }
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
        assert.strictEqual(res.status, 'COMPLETED');
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

    test('getFullTranscript returns transcript payload', async () => {
        const mockResponse: any = { status: () => mockResponse };
        const res = await controller.getFullTranscript('123', mockResponse);
        assert.equal(res.lectureId, 'l-123');
        assert.equal(res.transcript.text, 'text');
    });

    test('getTranscriptHighlights returns highlights list', async () => {
        const mockResponse: any = { status: () => mockResponse };
        const res = await controller.getTranscriptHighlights('123', mockResponse);
        assert.equal(Array.isArray(res.highlights), true);
        assert.equal(res.highlights?.[0]?.reason, 'important');
    });

    test('generateFlashcards enqueues generation request', async () => {
        let statusCode: number | undefined;
        let payload: any;
        const mockResponse: any = {
            status: (code: number) => {
                statusCode = code;
                return mockResponse;
            }
        };
        mockQueueService.enqueueFlashcard = async (p: any) => {
            payload = p;
        };
        const res = await controller.generateFlashcards('123', { count: 4 }, mockResponse);
        assert.equal(statusCode, 202);
        assert.equal(res.status, 'GENERATING_FLASHCARDS');
        assert.equal(payload.maxCards, 4);
    });

    test('generateFlashcards rejects when transcript is missing', async () => {
        mockJobStore.repo.getJob = async () => ({ jobId: '1', lectureId: 'l-1', status: 'QUEUED', transcriptText: null });
        const mockResponse: any = { status: () => mockResponse };
        try {
            await controller.generateFlashcards('1', { count: 2 }, mockResponse);
            assert.fail('should throw');
        } catch (error) {
            assert.ok(error instanceof ConflictException);
        } finally {
            mockJobStore.repo.getJob = async (id: string) => {
                if (id === '123') return {
                    jobId: '123',
                    lectureId: 'l-123',
                    status: 'COMPLETED',
                    transcriptPath: '/path',
                    transcriptText: 'text',
                    transcriptJson: JSON.stringify({ text: 'text', segments: [{ start: 0, end: 1, text: 'text' }] }),
                    flashcardsPath: null,
                    flashcardsJson: null
                };
                if (id === '456') return { jobId: '456', status: 'QUEUED' };
                if (id === '789') return { jobId: '789', status: 'FAILED', errorCode: 'X', errorMessage: 'boom' };
                return null;
            };
        }
    });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from './app.controller';
import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AssistantGenerationError } from '../services/material-assistant.service';
import { QuizGenerationError } from '../services/material-quiz.service';

describe('AppController', () => {
    let controller: AppController;
    let mockQueueService: any;
    let mockJobStore: any;
    let mockEnv: any;
    let mockAssistantService: any;
    let mockAssistantTtsService: any;
    let mockQuizService: any;

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

    mockAssistantService = {
        ask: async () => ({
            answer: 'Ответ по лекции: ключевая идея объясняется в материале.',
            citations: [{ startSec: 0, endSec: 5, text: 'Ключевой фрагмент лекции.' }],
            webSources: [],
            confidence: 0.86,
            refused: false
        }),
        retellTranscript: async () => ({
            recapText: 'Это полный пересказ лекции по ключевым смысловым блокам.'
        })
    };

    mockAssistantTtsService = {
        synthesize: async () => ({
            audioBase64: Buffer.from('fake-mp3').toString('base64'),
            audioMimeType: 'audio/mpeg',
            model: 'aura-2-thalia-en',
            chunks: 1
        })
    };

    mockQuizService = {
        generateQuiz: async () => ({
            schemaVersion: '1.0',
            generatedAt: new Date().toISOString(),
            language: 'ru',
            difficulty: 'medium',
            questions: [
                {
                    id: 'q1',
                    type: 'single_choice',
                    prompt: 'Что такое фотосинтез?',
                    options: [
                        { id: 'a', text: 'Процесс синтеза органики из света' },
                        { id: 'b', text: 'Тип деления клетки' }
                    ],
                    correctOptionIds: ['a'],
                    explanation: 'Фотосинтез преобразует световую энергию.'
                }
            ]
        }),
        toPublicQuiz: (quiz: any) => ({
            schemaVersion: quiz.schemaVersion,
            generatedAt: quiz.generatedAt,
            language: quiz.language,
            difficulty: quiz.difficulty,
            questions: quiz.questions.map((question: any) => ({
                id: question.id,
                type: question.type,
                prompt: question.prompt,
                options: question.options
            }))
        }),
        parseStoredQuiz: (value: string) => JSON.parse(value),
        parseAnswers: (answers: any) => answers,
        gradeQuiz: () => ({
            total: 1,
            correct: 1,
            percentage: 100,
            results: [
                {
                    questionId: 'q1',
                    correct: true,
                    explanation: 'Верно',
                    expectedAnswer: 'a',
                    userAnswer: 'a'
                }
            ]
        }),
        buildFinalStats: () => ({
            score: { total: 1, correct: 1, percentage: 100 },
            answered: 1,
            wrongCount: 0,
            needsWork: []
        })
    };

    mockJobStore = {
        repo: {
            getActiveJob: async () => null,
            createJob: async () => { },
            updateStatus: async () => { },
            saveSummary: async () => { },
            saveQuiz: async () => { },
            appendAssistantMessage: async () => { },
            getAssistantHistory: async () => [],
            trimAssistantHistory: async () => { },
            getJob: async (id: string) => {
                if (id === '123') return {
                    jobId: '123',
                    lectureId: 'l-123',
                    status: 'COMPLETED',
                    filename: 'lecture.mp3',
                    mimeType: 'audio/mpeg',
                    transcriptPath: '/path',
                    transcriptText: 'text',
                    transcriptJson: JSON.stringify({ duration: 10, text: 'text', segments: [{ start: 0, end: 1, text: 'text' }] }),
                    highlightsPath: '/h-path',
                    highlightsJson: JSON.stringify([{ start: 0, end: 5, text: 'важно', reason: 'ключевая идея' }]),
                    summaryPath: '/s-path',
                    summaryJson: JSON.stringify({ title: 't', duration: '00:00:10', smart_reading_time: '3 min', executive_summary: 'Очень краткая сводка по лекции и ее смыслу.', top_takeaways: ['a long enough takeaway', 'another meaningful takeaway', 'third meaningful takeaway'], material_insights: [{ kind: 'concept', title: 'Главная идея', importance: 'Показывает центральный тезис лекции.' }, { kind: 'example', title: 'Практический пример', importance: 'Позволяет применить идею на практике.' }, { kind: 'concept', title: 'Итоговый вывод', importance: 'Фиксирует финальную мысль лекции.' }], entities: { people: [], concepts: [] } }),
                    flashcardsPath: null,
                    flashcardsJson: null,
                    quizJson: null
                };
                if (id === '456') return { jobId: '456', lectureId: 'l-456', status: 'QUEUED' };
                if (id === '789') return { jobId: '789', status: 'FAILED', errorCode: 'X', errorMessage: 'boom' };
                return null;
            }
        }
    };

    controller = new AppController(
        mockEnv,
        mockQueueService,
        mockJobStore,
        mockAssistantService,
        mockAssistantTtsService,
        mockQuizService
    );

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

    test('createIngestionJob accepts txt document upload', async () => {
        let queuePayload: any;
        mockQueueService.enqueueIngestion = async (payload: any) => {
            queuePayload = payload;
        };

        const res = await controller.createIngestionJob(
            { sourceType: 'upload', requestedLanguage: 'ru', filename: 'lecture-notes.txt', mimeType: 'text/plain' },
            { buffer: Buffer.from('hello text') } as any
        );

        assert.ok(res.jobId);
        assert.strictEqual(res.status, 'QUEUED');
        assert.strictEqual(queuePayload.filename, 'lecture-notes.txt');
        assert.strictEqual(queuePayload.mimeType, 'text/plain');
    });

    test('createIngestionJob rejects unsupported upload extension and mime', async () => {
        await assert.rejects(
            () => controller.createIngestionJob({ sourceType: 'upload', requestedLanguage: 'ru', filename: 'bad.xyz', mimeType: 'application/xyz' }, { buffer: Buffer.from('x') } as any),
            (e) => e instanceof BadRequestException
        );
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

    test('generateTranscriptHighlights rejects non-audio/video source', async () => {
        const originalGetJob = mockJobStore.repo.getJob;
        mockJobStore.repo.getJob = async (id: string) => {
            if (id !== 'doc-1') return originalGetJob(id);
            return {
                jobId: 'doc-1',
                lectureId: 'l-doc-1',
                status: 'COMPLETED',
                filename: 'notes.pdf',
                mimeType: 'application/pdf',
                transcriptJson: JSON.stringify({ duration: 1, text: 'doc text', segments: [{ start: 0, end: 1, text: 'doc text' }] })
            };
        };
        const mockResponse: any = { status: () => mockResponse };
        await assert.rejects(
            () => controller.generateTranscriptHighlights('doc-1', mockResponse),
            (e) => e instanceof ConflictException
        );
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

    test('generateLectureSummary allows retry for FAILED job when transcript exists', async () => {
        let payload: any;
        const mockResponse: any = { status: () => mockResponse };
        const originalGetJob = mockJobStore.repo.getJob;
        mockJobStore.repo.getJob = async (id: string) => {
            if (id !== 'failed-with-transcript') return originalGetJob(id);
            return {
                jobId: 'failed-with-transcript',
                lectureId: 'l-failed',
                status: 'FAILED',
                filename: 'failed.mp3',
                transcriptText: 'ready transcript',
                transcriptJson: JSON.stringify({ duration: 42, text: 'ready transcript', segments: [] })
            };
        };
        mockQueueService.enqueueSummary = async (p: any) => { payload = p; };
        const res = await controller.generateLectureSummary('failed-with-transcript', mockResponse);
        assert.equal(res.status, 'GENERATING_SUMMARY');
        assert.equal(payload.jobId, 'failed-with-transcript');
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

    test('generateMaterialQuiz returns public quiz and stores it', async () => {
        let savedQuizJson = '';
        mockJobStore.repo.getJob = async (id: string) => {
            if (id !== 'quiz-source') return null;
            return {
                jobId: 'quiz-source',
                lectureId: 'l-quiz',
                status: 'COMPLETED',
                transcriptText: 'text',
                transcriptJson: JSON.stringify({ duration: 10, text: 'text', segments: [] })
            };
        };
        mockJobStore.repo.saveQuiz = async (_jobId: string, quizJson: string) => {
            savedQuizJson = quizJson;
        };
        const res = await controller.generateMaterialQuiz({
            jobId: 'quiz-source',
            count: 1,
            difficulty: 'medium',
            language: 'ru'
        });
        assert.equal(res.jobId, 'quiz-source');
        assert.equal(Array.isArray(res.quiz.questions), true);
        assert.equal(savedQuizJson.length > 0, true);
    });

    test('generateMaterialQuiz maps provider errors to 503 with deterministic code', async () => {
        mockJobStore.repo.getJob = async (id: string) => {
            if (id !== 'quiz-source-err') return null;
            return {
                jobId: 'quiz-source-err',
                lectureId: 'l-quiz',
                status: 'COMPLETED',
                transcriptText: 'text',
                transcriptJson: JSON.stringify({ duration: 10, text: 'text', segments: [] })
            };
        };
        mockQuizService.generateQuiz = async () => {
            throw new QuizGenerationError('QUIZ_AI_INVALID_RESPONSE', 'schema mismatch');
        };
        await assert.rejects(
            () => controller.generateMaterialQuiz({
                jobId: 'quiz-source-err',
                count: 1,
                difficulty: 'medium',
                language: 'ru'
            }),
            (e) => e instanceof ServiceUnavailableException
        );
    });

    test('checkMaterialQuiz returns score and explanations', async () => {
        const quizPayload = {
            schemaVersion: '1.0',
            generatedAt: new Date().toISOString(),
            language: 'ru',
            difficulty: 'medium',
            questions: [
                {
                    id: 'q1',
                    type: 'single_choice',
                    prompt: 'test',
                    options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
                    correctOptionIds: ['a'],
                    explanation: 'exp'
                }
            ]
        };
        const originalGetJob = mockJobStore.repo.getJob;
        mockJobStore.repo.getJob = async (id: string) => {
            if (id !== 'quiz-job') return originalGetJob(id);
            return {
                jobId: 'quiz-job',
                lectureId: 'l-q',
                status: 'COMPLETED',
                transcriptText: 'text',
                quizJson: JSON.stringify(quizPayload)
            };
        };
        const res = await controller.checkMaterialQuiz({
            jobId: 'quiz-job',
            answers: [{ questionId: 'q1', selectedOptionIds: ['a'] }]
        });
        assert.equal(res.score.percentage, 100);
        assert.equal(Array.isArray(res.results), true);
    });

    test('getMaterialQuizStats returns final stats and recommendations', async () => {
        const quizPayload = {
            schemaVersion: '1.0',
            generatedAt: new Date().toISOString(),
            language: 'ru',
            difficulty: 'medium',
            questions: [
                {
                    id: 'q1',
                    type: 'single_choice',
                    prompt: 'test',
                    options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
                    correctOptionIds: ['a'],
                    explanation: 'exp'
                }
            ]
        };
        mockQuizService.buildFinalStats = () => ({
            score: { total: 1, correct: 0, percentage: 0 },
            answered: 1,
            wrongCount: 1,
            needsWork: [
                { questionId: 'q1', topic: 'test', recommendation: 'Повторить тему test' }
            ]
        });
        const originalGetJob = mockJobStore.repo.getJob;
        mockJobStore.repo.getJob = async (id: string) => {
            if (id !== 'quiz-stats-job') return originalGetJob(id);
            return {
                jobId: 'quiz-stats-job',
                lectureId: 'l-q',
                status: 'COMPLETED',
                transcriptText: 'text',
                quizJson: JSON.stringify(quizPayload)
            };
        };
        const res = await controller.getMaterialQuizStats({
            jobId: 'quiz-stats-job',
            answers: [{ questionId: 'q1', selectedOptionIds: ['b'] }]
        });
        assert.equal(res.score.percentage, 0);
        assert.equal(res.wrongCount, 1);
        assert.equal(Array.isArray(res.needsWork), true);
    });

    test('askMaterialAssistant returns answer with citations and confidence', async () => {
        mockJobStore.repo.getJob = async () => ({
            jobId: '123',
            lectureId: 'l-123',
            status: 'COMPLETED',
            transcriptText: 'text',
            transcriptJson: JSON.stringify({ duration: 10, text: 'text', segments: [{ start: 0, end: 1, text: 'text' }] }),
            summaryJson: null
        });
        const res = await controller.askMaterialAssistant({
            jobId: '123',
            sessionId: 'session-1',
            question: 'О чем ключевая идея лекции?'
        });
        assert.equal(typeof res.answer, 'string');
        assert.equal(Array.isArray(res.citations), true);
        assert.equal(Array.isArray(res.webSources), true);
        assert.equal(res.sources && Array.isArray(res.sources.lecture), true);
        assert.equal(res.sources && Array.isArray(res.sources.web), true);
        assert.equal(typeof res.confidence, 'number');
        assert.equal(res.refused, false);
    });

    test('askMaterialAssistant rejects when transcript is not ready', async () => {
        mockJobStore.repo.getJob = async (id: string) => {
            if (id === 'not-ready') {
                return {
                    jobId: 'not-ready',
                    lectureId: 'l-nr',
                    status: 'QUEUED',
                    transcriptText: null
                };
            }
            return null;
        };
        await assert.rejects(
            () => controller.askMaterialAssistant({
                jobId: 'not-ready',
                sessionId: 'session-2',
                question: 'Что было в лекции?'
            }),
            (e) => e instanceof ConflictException
        );
    });

    test('askMaterialAssistant maps provider errors to 503', async () => {
        mockJobStore.repo.getJob = async () => ({
            jobId: '123',
            lectureId: 'l-123',
            status: 'COMPLETED',
            transcriptText: 'text',
            transcriptJson: JSON.stringify({ duration: 10, text: 'text', segments: [{ start: 0, end: 1, text: 'text' }] }),
            summaryJson: null
        });
        mockAssistantService.ask = async () => {
            throw new AssistantGenerationError('ASSISTANT_AI_HTTP_ERROR', 'timeout');
        };

        await assert.rejects(
            () => controller.askMaterialAssistant({
                jobId: '123',
                sessionId: 'session-timeout',
                question: 'Скажи итог'
            }),
            (e) => e instanceof ServiceUnavailableException
        );
    });

    test('generateAssistantRecapAudio returns recap text and audio payload', async () => {
        mockJobStore.repo.getJob = async () => ({
            jobId: '123',
            lectureId: 'l-123',
            status: 'COMPLETED',
            transcriptText: 'text',
            transcriptJson: JSON.stringify({ duration: 10, text: 'text', segments: [{ start: 0, end: 1, text: 'text' }] }),
            summaryJson: null
        });
        const res = await controller.generateAssistantRecapAudio({
            jobId: '123',
            sessionId: 'session-tts',
            ttsModel: 'aura-2-thalia-en'
        });
        assert.equal(typeof res.recapText, 'string');
        assert.equal(typeof res.audioBase64, 'string');
        assert.equal(res.audioMimeType, 'audio/mpeg');
    });
});

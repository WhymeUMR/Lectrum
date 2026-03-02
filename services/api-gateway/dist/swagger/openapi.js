"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhanceOpenApiDocument = enhanceOpenApiDocument;
function enhanceOpenApiDocument(document) {
    const doc = document;
    doc.tags = [
        {
            name: 'System',
            description: 'Системные ручки для проверки состояния сервиса.'
        },
        {
            name: 'Ingestion',
            description: 'Загрузка лекции и запуск пайплайна обработки.'
        },
        {
            name: 'Jobs',
            description: 'Статусы, результаты и артефакты обработки лекции.'
        },
        {
            name: 'Assistant',
            description: 'Вопросы к ассистенту по лекции и TTS-функции.'
        },
        {
            name: 'Flashcards',
            description: 'Генерация карточек по расшифровке лекции.'
        },
        {
            name: 'Quiz',
            description: 'Генерация и проверка тестов по материалу лекции.'
        },
        {
            name: 'Auth',
            description: 'Аутентификация и состояние пользователя.'
        }
    ];
    doc.components = doc.components ?? {};
    doc.components.securitySchemes = {
        ...(doc.components.securitySchemes ?? {}),
        bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Передайте access token в формате: Bearer <token>'
        }
    };
    doc.components.schemas = {
        ...(doc.components.schemas ?? {}),
        ErrorResponse: {
            type: 'object',
            properties: {
                statusCode: { type: 'number', example: 400 },
                message: { oneOf: [{ type: 'string' }, { type: 'object' }] },
                errorCode: { type: 'string', nullable: true, example: 'ASSISTANT_AI_HTTP_ERROR' },
                details: { type: 'string', nullable: true }
            }
        },
        ValidationErrorResponse: {
            type: 'object',
            properties: {
                statusCode: { type: 'number', example: 400 },
                message: { type: 'string', example: 'Validation failed' },
                errors: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', example: 'count' },
                            message: { type: 'string', example: 'Number must be less than or equal to 10' }
                        }
                    }
                }
            }
        },
        TokenPair: {
            type: 'object',
            properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                accessExpiresIn: { type: 'number', example: 900 },
                refreshExpiresIn: { type: 'number', example: 2592000 },
                tokenType: { type: 'string', example: 'Bearer' }
            },
            required: ['accessToken', 'refreshToken', 'accessExpiresIn', 'refreshExpiresIn', 'tokenType']
        },
        AuthUser: {
            type: 'object',
            properties: {
                sub: { type: 'string', example: '4f9f9178-a3d8-4d8a-a91e-9f6f67ff3d4d' },
                login: { type: 'string', example: 'student_01' },
                role: { type: 'string', enum: ['admin', 'user'], example: 'user' }
            },
            required: ['sub', 'login', 'role']
        },
        AuthState: {
            type: 'object',
            properties: {
                lastJobId: { type: 'string', nullable: true },
                assistantSessionId: { type: 'string', nullable: true },
                updatedAt: { type: 'string', format: 'date-time', nullable: true }
            }
        },
        JobListResponse: {
            type: 'object',
            properties: {
                items: {
                    type: 'array',
                    items: { type: 'object', additionalProperties: true }
                },
                count: { type: 'number', example: 3 },
                limit: { type: 'number', example: 20 }
            },
            required: ['items', 'count', 'limit']
        },
        IngestionRequest: {
            type: 'object',
            properties: {
                sourceType: { type: 'string', enum: ['upload', 'url'], example: 'upload' },
                sourceUrl: { type: 'string', format: 'uri', nullable: true, example: 'https://example.com/lecture.mp4' },
                filename: { type: 'string', example: 'lecture1.mp3' },
                mimeType: { type: 'string', nullable: true, example: 'audio/mpeg' },
                requestedLanguage: { type: 'string', example: 'ru', default: 'ru' },
                fileBase64: {
                    type: 'string',
                    nullable: true,
                    description: 'Base64 контент файла. Используется для JSON-запроса вместо multipart.'
                },
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Файл для sourceType=upload (multipart/form-data).'
                }
            },
            required: ['sourceType', 'filename']
        },
        IngestionAccepted: {
            type: 'object',
            properties: {
                jobId: { type: 'string' },
                lectureId: { type: 'string' },
                status: { type: 'string', example: 'QUEUED' },
                queue: { type: 'string', example: 'lec.v1.ingestion' }
            },
            required: ['jobId', 'lectureId', 'status', 'queue']
        },
        GenerateFlashcardsRequest: {
            type: 'object',
            properties: {
                count: { type: 'integer', minimum: 1, maximum: 10, default: 5 }
            },
            required: ['count']
        },
        GenerateFlashcardsByJobRequest: {
            type: 'object',
            properties: {
                jobId: { type: 'string' },
                count: { type: 'integer', minimum: 1, maximum: 10, default: 5 }
            },
            required: ['jobId', 'count']
        },
        GenerateQuizRequest: {
            type: 'object',
            properties: {
                jobId: { type: 'string' },
                count: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
                difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], default: 'medium' },
                language: { type: 'string', minLength: 2, maxLength: 10, default: 'ru' }
            },
            required: ['jobId', 'count', 'difficulty', 'language']
        },
        QuizAnswerInput: {
            type: 'object',
            properties: {
                questionId: { type: 'string' },
                selectedOptionIds: { type: 'array', items: { type: 'string' }, nullable: true },
                answerText: { type: 'string', nullable: true }
            },
            required: ['questionId']
        },
        CheckQuizAnswersRequest: {
            type: 'object',
            properties: {
                jobId: { type: 'string' },
                answers: {
                    type: 'array',
                    minItems: 1,
                    items: { $ref: '#/components/schemas/QuizAnswerInput' }
                }
            },
            required: ['jobId', 'answers']
        },
        AssistantAskRequest: {
            type: 'object',
            properties: {
                jobId: { type: 'string' },
                sessionId: { type: 'string', minLength: 1, maxLength: 128 },
                question: { type: 'string', minLength: 3, maxLength: 2000 }
            },
            required: ['jobId', 'sessionId', 'question']
        },
        AssistantRecapRequest: {
            type: 'object',
            properties: {
                jobId: { type: 'string' },
                sessionId: { type: 'string', minLength: 1, maxLength: 128 },
                ttsModel: { type: 'string', nullable: true },
                ttsVoiceId: { type: 'string', nullable: true }
            },
            required: ['jobId', 'sessionId']
        },
        AssistantTtsPreviewRequest: {
            type: 'object',
            properties: {
                ttsVoiceId: { type: 'string' },
                ttsModel: { type: 'string', nullable: true },
                text: { type: 'string', nullable: true, maxLength: 500 }
            },
            required: ['ttsVoiceId']
        },
        AuthCredentials: {
            type: 'object',
            properties: {
                login: { type: 'string', example: 'student_01' },
                password: { type: 'string', example: 'StrongPassword123' }
            },
            required: ['login', 'password']
        },
        AuthGoogleRequest: {
            type: 'object',
            properties: {
                idToken: { type: 'string' }
            },
            required: ['idToken']
        },
        AuthTelegramRequest: {
            type: 'object',
            properties: {
                id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
                first_name: { type: 'string', nullable: true },
                last_name: { type: 'string', nullable: true },
                username: { type: 'string', nullable: true },
                photo_url: { type: 'string', nullable: true },
                auth_date: { oneOf: [{ type: 'string' }, { type: 'number' }] },
                hash: { type: 'string' }
            },
            required: ['id', 'auth_date', 'hash']
        },
        AuthRefreshRequest: {
            type: 'object',
            properties: {
                refreshToken: { type: 'string' }
            },
            required: ['refreshToken']
        },
        AuthStateUpdateRequest: {
            type: 'object',
            properties: {
                lastJobId: { type: 'string', nullable: true },
                assistantSessionId: { type: 'string', nullable: true }
            }
        }
    };
    const apply = (path, method, patch) => {
        const normalizedMethod = method.toLowerCase();
        doc.paths[path] = doc.paths[path] ?? {};
        doc.paths[path][normalizedMethod] = {
            ...(doc.paths[path][normalizedMethod] ?? {}),
            ...patch
        };
    };
    apply('/health', 'get', {
        tags: ['System'],
        summary: 'Проверка доступности API',
        description: 'Публичный health-check для liveness probes и мониторинга.',
        responses: {
            '200': {
                description: 'Сервис работает',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                status: { type: 'string', example: 'ok' },
                                service: { type: 'string' },
                                appEnv: { type: 'string' },
                                queuePrefix: { type: 'string' },
                                contractVersion: { type: 'string', example: 'v1' }
                            }
                        }
                    }
                }
            }
        }
    });
    apply('/ready', 'get', {
        tags: ['System'],
        summary: 'Проверка готовности зависимостей',
        description: 'Публичная readiness-проверка с именами очередей.',
        responses: {
            '200': {
                description: 'Сервис готов принимать запросы',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                status: { type: 'string', example: 'ready' },
                                queues: { type: 'object', additionalProperties: { type: 'string' } }
                            }
                        }
                    }
                }
            }
        }
    });
    apply('/api/v1/lectures/ingest', 'post', {
        tags: ['Ingestion'],
        summary: 'Создать задачу обработки лекции',
        description: 'Запускает пайплайн обработки. Можно отправить файл через multipart (`file`) или как `fileBase64` в JSON. Для URL-режима передайте `sourceType=url` и `sourceUrl`.',
        security: [{ bearerAuth: [] }],
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/IngestionRequest' }
                },
                'multipart/form-data': {
                    schema: { $ref: '#/components/schemas/IngestionRequest' }
                }
            }
        },
        responses: {
            '201': {
                description: 'Задача создана и поставлена в очередь',
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/IngestionAccepted' }
                    }
                }
            },
            '400': {
                description: 'Ошибка валидации или неподдерживаемый тип файла',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } }
            },
            '401': {
                description: 'Нет токена авторизации',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            '409': {
                description: 'У пользователя уже есть активная задача обработки',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            '413': {
                description: 'Файл слишком большой',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            '503': {
                description: 'Очередь временно недоступна',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            }
        }
    });
    apply('/api/v1/jobs', 'get', {
        tags: ['Jobs'],
        summary: 'Список задач пользователя',
        description: 'Возвращает последние задачи текущего пользователя (ограничение по `limit`).',
        security: [{ bearerAuth: [] }],
        parameters: [
            {
                in: 'query',
                name: 'limit',
                required: false,
                schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
                description: 'Сколько задач вернуть.'
            }
        ],
        responses: {
            '200': {
                description: 'Список задач',
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/JobListResponse' }
                    }
                }
            },
            '401': {
                description: 'Нет токена авторизации',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            }
        }
    });
    apply('/api/v1/jobs/{jobId}', 'get', {
        tags: ['Jobs'],
        summary: 'Получить задачу по ID',
        description: 'Возвращает полную запись задачи, если она принадлежит текущему пользователю.',
        security: [{ bearerAuth: [] }],
        parameters: [
            {
                in: 'path',
                name: 'jobId',
                required: true,
                schema: { type: 'string' }
            }
        ],
        responses: {
            '200': {
                description: 'Данные задачи',
                content: {
                    'application/json': {
                        schema: { type: 'object', additionalProperties: true }
                    }
                }
            },
            '401': {
                description: 'Нет токена авторизации',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            },
            '404': {
                description: 'Задача не найдена или недоступна пользователю',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
            }
        }
    });
    const jobIdParam = [
        {
            in: 'path',
            name: 'jobId',
            required: true,
            schema: { type: 'string' }
        }
    ];
    apply('/api/v1/jobs/{jobId}/result', 'get', {
        tags: ['Jobs'],
        summary: 'Получить итог обработки лекции',
        description: 'Если задача еще выполняется, вернет `202 Accepted`. Если задача упала, вернет `422`. При успехе вернет итоговые артефакты.',
        security: [{ bearerAuth: [] }],
        parameters: jobIdParam,
        responses: {
            '200': {
                description: 'Итог готов',
                content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } }
            },
            '202': {
                description: 'Результат пока не готов',
                content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } }
            },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '422': {
                description: 'Обработка завершилась с ошибкой',
                content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } }
            }
        }
    });
    apply('/api/v1/jobs/{jobId}/transcript', 'get', {
        tags: ['Jobs'],
        summary: 'Получить полную расшифровку',
        description: 'Возвращает transcript JSON. Если transcript еще не готов, вернет `202`.',
        security: [{ bearerAuth: [] }],
        parameters: jobIdParam,
        responses: {
            '200': { description: 'Расшифровка готова', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
            '202': { description: 'Расшифровка еще не готова', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '422': { description: 'Задача завершилась ошибкой', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }
        }
    });
    apply('/api/v1/jobs/{jobId}/highlights', 'post', {
        tags: ['Jobs'],
        summary: 'Запустить генерацию хайлайтов',
        description: 'Ставит задачу генерации highlights в очередь (для аудио/видео лекций).',
        security: [{ bearerAuth: [] }],
        parameters: jobIdParam,
        responses: {
            '202': { description: 'Генерация запущена', content: { 'application/json': { schema: { type: 'object', properties: { jobId: { type: 'string' }, status: { type: 'string', example: 'GENERATING_HIGHLIGHTS' } } } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '409': { description: 'Конфликт статуса задачи', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '503': { description: 'Очередь недоступна', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/jobs/{jobId}/highlights', 'get', {
        tags: ['Jobs'],
        summary: 'Получить хайлайты лекции',
        security: [{ bearerAuth: [] }],
        parameters: jobIdParam,
        responses: {
            '200': { description: 'Хайлайты готовы', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
            '202': { description: 'Хайлайты еще не готовы', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '422': { description: 'Задача завершилась ошибкой', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }
        }
    });
    apply('/api/v1/jobs/{jobId}/summary', 'post', {
        tags: ['Jobs'],
        summary: 'Запустить генерацию summary',
        description: 'Ставит задачу генерации краткого конспекта лекции в очередь.',
        security: [{ bearerAuth: [] }],
        parameters: jobIdParam,
        responses: {
            '202': { description: 'Генерация summary запущена', content: { 'application/json': { schema: { type: 'object', properties: { jobId: { type: 'string' }, status: { type: 'string', example: 'GENERATING_SUMMARY' } } } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '409': { description: 'Конфликт статуса задачи', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '503': { description: 'Очередь недоступна', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/jobs/{jobId}/summary', 'get', {
        tags: ['Jobs'],
        summary: 'Получить summary лекции',
        security: [{ bearerAuth: [] }],
        parameters: jobIdParam,
        responses: {
            '200': { description: 'Summary готов', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
            '202': { description: 'Summary еще не готов', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '422': { description: 'Задача завершилась ошибкой', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }
        }
    });
    apply('/api/v1/jobs/{jobId}/flashcards', 'post', {
        tags: ['Flashcards'],
        summary: 'Запустить генерацию карточек по jobId (в path)',
        security: [{ bearerAuth: [] }],
        parameters: jobIdParam,
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/GenerateFlashcardsRequest' }
                }
            }
        },
        responses: {
            '202': { description: 'Генерация карточек запущена', content: { 'application/json': { schema: { type: 'object', properties: { jobId: { type: 'string' }, status: { type: 'string', example: 'GENERATING_FLASHCARDS' }, requestedCards: { type: 'number', example: 5 } } } } } },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '409': { description: 'Нельзя запускать генерацию в текущем статусе', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '503': { description: 'Очередь недоступна', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/flashcards/generate', 'post', {
        tags: ['Flashcards'],
        summary: 'Запустить генерацию карточек по jobId (в body)',
        security: [{ bearerAuth: [] }],
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/GenerateFlashcardsByJobRequest' }
                }
            }
        },
        responses: {
            '202': { description: 'Генерация карточек запущена', content: { 'application/json': { schema: { type: 'object', properties: { jobId: { type: 'string' }, status: { type: 'string', example: 'GENERATING_FLASHCARDS' }, requestedCards: { type: 'number', example: 5 } } } } } },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '409': { description: 'Нельзя запускать генерацию в текущем статусе', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '503': { description: 'Очередь недоступна', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/tests/generate', 'post', {
        tags: ['Quiz'],
        summary: 'Сгенерировать тест по лекции',
        security: [{ bearerAuth: [] }],
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/GenerateQuizRequest' }
                }
            }
        },
        responses: {
            '201': {
                description: 'Тест сгенерирован',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                jobId: { type: 'string' },
                                quiz: { type: 'object', additionalProperties: true }
                            }
                        }
                    }
                }
            },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '409': { description: 'Transcript еще не готов', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '503': { description: 'AI-провайдер временно недоступен', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/tests/check', 'post', {
        tags: ['Quiz'],
        summary: 'Проверить ответы на тест',
        security: [{ bearerAuth: [] }],
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/CheckQuizAnswersRequest' }
                }
            }
        },
        responses: {
            '201': {
                description: 'Ответы проверены',
                content: {
                    'application/json': {
                        schema: { type: 'object', additionalProperties: true }
                    }
                }
            },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '409': { description: 'Тест еще не сгенерирован', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/tests/stats', 'post', {
        tags: ['Quiz'],
        summary: 'Получить статистику по результатам теста',
        security: [{ bearerAuth: [] }],
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/CheckQuizAnswersRequest' }
                }
            }
        },
        responses: {
            '201': {
                description: 'Статистика построена',
                content: {
                    'application/json': {
                        schema: { type: 'object', additionalProperties: true }
                    }
                }
            },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '409': { description: 'Тест еще не сгенерирован', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/assistant/ask', 'post', {
        tags: ['Assistant'],
        summary: 'Задать вопрос ассистенту по лекции',
        description: 'Возвращает ответ ассистента, цитаты из лекции и web-ссылки (если были использованы).',
        security: [{ bearerAuth: [] }],
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/AssistantAskRequest' }
                }
            }
        },
        responses: {
            '201': { description: 'Ответ ассистента', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '409': { description: 'Transcript еще не готов', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '503': { description: 'Ассистент временно недоступен', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/assistant/recap', 'post', {
        tags: ['Assistant'],
        summary: 'Сгенерировать текстовый пересказ лекции',
        security: [{ bearerAuth: [] }],
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/AssistantRecapRequest' }
                }
            }
        },
        responses: {
            '201': { description: 'Текст пересказа', content: { 'application/json': { schema: { type: 'object', properties: { jobId: { type: 'string' }, sessionId: { type: 'string' }, recapText: { type: 'string' } } } } } },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '409': { description: 'Transcript еще не готов', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '503': { description: 'Ассистент временно недоступен', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/assistant/recap-audio', 'post', {
        tags: ['Assistant'],
        summary: 'Сгенерировать пересказ с аудио в base64',
        security: [{ bearerAuth: [] }],
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/AssistantRecapRequest' }
                }
            }
        },
        responses: {
            '201': { description: 'Пересказ + аудио base64', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '409': { description: 'Transcript еще не готов', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '503': { description: 'TTS временно недоступен', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/assistant/recap-audio/karaoke', 'post', {
        tags: ['Assistant'],
        summary: 'Сгенерировать пересказ с таймкодами слов (karaoke)',
        security: [{ bearerAuth: [] }],
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/AssistantRecapRequest' }
                }
            }
        },
        responses: {
            '201': { description: 'Пересказ + аудио + массив `words`', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '409': { description: 'Transcript еще не готов', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '503': { description: 'TTS временно недоступен', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/assistant/recap-audio/stream', 'post', {
        tags: ['Assistant'],
        summary: 'Сгенерировать и вернуть аудио пересказа как бинарный поток',
        description: 'Возвращает бинарный `audio/mpeg`. Дополнительные метаданные приходят в заголовках `x-tts-model`, `x-tts-chunks`, `x-recap-preview`.',
        security: [{ bearerAuth: [] }],
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/AssistantRecapRequest' }
                }
            }
        },
        responses: {
            '200': {
                description: 'Бинарный аудио-файл',
                content: {
                    'audio/mpeg': {
                        schema: {
                            type: 'string',
                            format: 'binary'
                        }
                    }
                }
            },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Задача не найдена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '409': { description: 'Transcript еще не готов', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '503': { description: 'TTS временно недоступен', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/assistant/tts/voices', 'get', {
        tags: ['Assistant'],
        summary: 'Получить список доступных голосов TTS',
        security: [{ bearerAuth: [] }],
        responses: {
            '200': {
                description: 'Список голосов',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                voices: { type: 'array', items: { type: 'object', additionalProperties: true } },
                                defaultVoiceId: { type: 'string' },
                                ttsModel: { type: 'string' }
                            }
                        }
                    }
                }
            },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '503': { description: 'Голоса временно недоступны', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/assistant/tts-preview/stream', 'post', {
        tags: ['Assistant'],
        summary: 'Прослушать голос (предпросмотр) как бинарный аудио-поток',
        security: [{ bearerAuth: [] }],
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/AssistantTtsPreviewRequest' }
                }
            }
        },
        responses: {
            '200': {
                description: 'Бинарный аудио-поток preview',
                content: {
                    'audio/mpeg': {
                        schema: {
                            type: 'string',
                            format: 'binary'
                        }
                    }
                }
            },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Нет токена', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '503': { description: 'Preview временно недоступен', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/auth/register', 'post', {
        tags: ['Auth'],
        summary: 'Регистрация локального пользователя',
        description: 'Создает пользователя и сразу выдает access/refresh токены.',
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/AuthCredentials' }
                }
            }
        },
        responses: {
            '201': { description: 'Пользователь зарегистрирован', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenPair' } } } },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '409': { description: 'Пользователь уже существует', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/auth/login', 'post', {
        tags: ['Auth'],
        summary: 'Логин по login/password',
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/AuthCredentials' }
                }
            }
        },
        responses: {
            '201': { description: 'Успешный логин', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenPair' } } } },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Неверные учетные данные', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/auth/google', 'post', {
        tags: ['Auth'],
        summary: 'Логин через Google ID Token',
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/AuthGoogleRequest' }
                }
            }
        },
        responses: {
            '201': { description: 'Успешный логин через Google', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenPair' } } } },
            '400': { description: 'Google auth не настроен / ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '401': { description: 'Невалидный Google token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/auth/telegram', 'post', {
        tags: ['Auth'],
        summary: 'Логин через Telegram Login Widget payload',
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/AuthTelegramRequest' }
                }
            }
        },
        responses: {
            '201': { description: 'Успешный логин через Telegram', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenPair' } } } },
            '400': { description: 'Telegram auth не настроен / ошибка payload', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '401': { description: 'Невалидная подпись Telegram payload', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/auth/refresh', 'post', {
        tags: ['Auth'],
        summary: 'Обновить токены по refresh token',
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/AuthRefreshRequest' }
                }
            }
        },
        responses: {
            '201': { description: 'Токены обновлены', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenPair' } } } },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Refresh token невалиден или истек', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/auth/logout', 'post', {
        tags: ['Auth'],
        summary: 'Разлогинить refresh token (revoke)',
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/AuthRefreshRequest' }
                }
            }
        },
        responses: {
            '201': {
                description: 'Refresh token отозван',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                success: { type: 'boolean', example: true }
                            },
                            required: ['success']
                        }
                    }
                }
            },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Refresh token невалиден', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/auth/me', 'get', {
        tags: ['Auth'],
        summary: 'Получить текущего пользователя',
        security: [{ bearerAuth: [] }],
        responses: {
            '200': {
                description: 'Текущий пользователь',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                user: { $ref: '#/components/schemas/AuthUser' }
                            },
                            required: ['user']
                        }
                    }
                }
            },
            '401': { description: 'Пользователь не авторизован', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/auth/state', 'get', {
        tags: ['Auth'],
        summary: 'Получить пользовательское состояние UI',
        description: 'Возвращает `lastJobId` и `assistantSessionId` для восстановления клиентского состояния.',
        security: [{ bearerAuth: [] }],
        responses: {
            '200': {
                description: 'Состояние пользователя',
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/AuthState' }
                    }
                }
            },
            '401': { description: 'Пользователь не авторизован', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    apply('/api/v1/auth/state', 'post', {
        tags: ['Auth'],
        summary: 'Обновить пользовательское состояние UI',
        security: [{ bearerAuth: [] }],
        requestBody: {
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/AuthStateUpdateRequest' }
                }
            }
        },
        responses: {
            '201': {
                description: 'Состояние обновлено',
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/AuthState' }
                    }
                }
            },
            '400': { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
            '401': { description: 'Пользователь не авторизован', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
    });
    return doc;
}
//# sourceMappingURL=openapi.js.map
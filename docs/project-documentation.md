# Документация проекта Lectrum

## 1. Что это за проект
Lectrum — это микросервисная платформа, которая превращает учебные материалы (аудио/видео, URL, текстовые и документные источники) в структурированные результаты для обучения:

- транскрипт лекции;
- ключевые моменты (highlights);
- краткое summary;
- набор flashcards;
- тест по материалу;
- ассистент по содержимому лекции с поддержкой TTS.

Проект рассчитан на асинхронную обработку через очереди и хранит результаты в Postgres + файловых артефактах.

## 2. Технологический стек
- Backend: Node.js + TypeScript + NestJS
- Очереди и фоновые задачи: BullMQ + Redis
- База данных: PostgreSQL
- Вспомогательные парсеры: Python-сервисы (URL и video parsing)
- Frontend: веб-клиент `services/frontend-prototype`
- Инфраструктура локального запуска: Docker Compose

## 3. Архитектура сервисов
Основные сервисы в `docker-compose.yml`:

- `api-gateway` — основной HTTP API, auth, оркестрация задач и выдача результатов.
- `ingestion-service` — прием и первичная подготовка источника.
- `transcription-worker` — транскрибация и сохранение текста/сегментов.
- `highlight-worker` — генерация highlights из транскрипта.
- `summary-worker` — генерация summary.
- `summary-fallback-worker` — fallback-генерация summary.
- `flashcard-worker` — генерация учебных карточек.
- `url-parser-service` — парсинг URL-контента.
- `video-parser-service` — извлечение контента из video URL.
- `postgres`, `redis` — инфраструктурные зависимости.
- `frontend-prototype` — web-клиент для локальной работы с API.

## 4. Жизненный цикл обработки лекции
Базовый pipeline:

1. Клиент отправляет запрос на ingestion.
2. Создается `job` со статусом `QUEUED`.
3. Ingestion сохраняет/подготавливает исходный материал.
4. Transcription worker строит транскрипт (`text`, `segments`, `duration`, `language`).
5. По запросу пользователя запускаются генерации:
   - highlights;
   - summary;
   - flashcards;
   - quiz.
6. API отдает прогресс и итоговые артефакты через `jobs`-эндпоинты.

Ключевые статусы: `QUEUED`, `INGESTING`, `INGESTED`, `TRANSCRIBING`, `GENERATING_HIGHLIGHTS`, `GENERATING_SUMMARY`, `GENERATING_FLASHCARDS`, `COMPLETED`, `FAILED`.

## 5. API (основные группы)
### Health
- `GET /health`
- `GET /ready`

### Auth
Публичные:
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/google`
- `POST /api/v1/auth/telegram`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

Защищенные:
- `POST /api/v1/auth/change-password`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/state`
- `POST /api/v1/auth/state`

### Ingestion
- `POST /api/v1/lectures/ingest` (upload)
- `POST /api/v1/lectures/ingest-url`
- `POST /api/v1/lectures/ingest-video`

### Jobs и результаты
- `GET /api/v1/jobs`
- `GET /api/v1/jobs/:jobId`
- `GET /api/v1/jobs/:jobId/result`
- `GET /api/v1/jobs/:jobId/transcript`

### Генерация материалов
- `POST /api/v1/jobs/:jobId/highlights`
- `GET /api/v1/jobs/:jobId/highlights`
- `POST /api/v1/jobs/:jobId/summary`
- `GET /api/v1/jobs/:jobId/summary`
- `POST /api/v1/jobs/:jobId/flashcards`
- `POST /api/v1/flashcards/generate`

### Quiz
- `POST /api/v1/tests/generate`
- `POST /api/v1/tests/check`
- `POST /api/v1/tests/stats`

### Assistant + TTS
- `POST /api/v1/assistant/ask`
- `POST /api/v1/assistant/recap`
- `POST /api/v1/assistant/recap-audio`
- `POST /api/v1/assistant/recap-audio/stream`
- `POST /api/v1/assistant/recap-audio/karaoke`
- `GET /api/v1/assistant/tts/voices`
- `POST /api/v1/assistant/tts-preview/stream`

## 6. Локальный запуск
### Требования
- Docker + Docker Compose
- Node.js и npm (для локальных скриптов и тестов)

### Быстрый старт
```bash
cp .env.example .env
make up
make health
```

### Полезные команды
```bash
make logs
make down
make smoke-ingestion
```

Порты по умолчанию:
- API Gateway: `http://localhost:3100`
- Ingestion: `http://localhost:3101`
- Transcription: `http://localhost:3102`
- Flashcard: `http://localhost:3103`
- Highlight: `http://localhost:3104`
- Summary: `http://localhost:3105`
- Summary fallback: `http://localhost:3106`
- URL parser: `http://localhost:3107`
- Video parser: `http://localhost:3108`
- Postgres: `localhost:15432`
- Redis: `localhost:16379`

## 7. Конфигурация окружения
Источник переменных: `.env` (стартуйте с `.env.example`).

Ключевые группы:
- инфраструктура: `DATABASE_URL`, `REDIS_URL`, `ARTIFACTS_DIR`;
- pipeline: `TRANSCRIPTION_*`, `UPLOAD_MAX_FILE_SIZE_BYTES`, `JOB_*`;
- LLM/TTS: `OPENAI_*`, `OPENAI_FALLBACK_API_KEY`, `DEEPGRAM_*`, `ELEVENLABS_*`;
- URL/video parsing: `URL_PARSER_*`, `VIDEO_PARSER_*`, `CRAWL4AI_*`;
- auth: `AUTH_JWT_*`, `AUTH_ACCESS_TTL_SECONDS`, `AUTH_REFRESH_TTL_SECONDS`, `AUTH_USER_*`.

Перед запуском staging/production рекомендуется прогонять:
```bash
./scripts/check-config.sh staging
./scripts/check-config.sh production
```

## 8. Тестирование и проверки
```bash
make lint
make test
make test-unit
make test-integration
make test-e2e
```

Также доступны сценарии в `npm`:
```bash
npm run verify:step6
npm run verify:step8
npm run verify:step9
npm run verify:step24
```

## 9. Структура репозитория
- `services/` — микросервисы и фронтенд
- `packages/` — общие пакеты (`contracts`, `config`, `pipeline`)
- `scripts/` — инфраструктурные скрипты запуска и проверок
- `tests/` — unit/integration тесты верхнего уровня
- `env/` — профили окружений

## 10. Частые проблемы
- `401/Authorization token is required`: проверьте Bearer JWT для защищенных `api/v1` эндпоинтов.
- `Queue is temporarily unavailable`: проверьте здоровье `redis` и worker-сервисов.
- Долгая обработка: используйте `GET /api/v1/jobs/:jobId/result`, ориентируйтесь на `recommendedPollIntervalMs`.
- Ошибки генерации: смотрите `errorCode`/`errorMessage` в ответах job result.


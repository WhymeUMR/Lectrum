# Lecture-to-Flashcards

Микросервисный backend-скелет на NestJS + BullMQ.

## Сервисы

- `api-gateway`
- `ingestion-service`
- `transcription-worker`
- `flashcard-worker`
- `url-parser-service`
- `video-parser-service`
- `redis`
- `postgres`

## Что реализовано на шаге 5

- API endpoint для старта обработки лекции: `POST /api/v1/lectures/ingest`
- Хранение статусов задачи в Postgres (`QUEUED -> INGESTING -> INGESTED -> TRANSCRIBING -> GENERATING_FLASHCARDS -> COMPLETED/FAILED`)
- Постановка задач транскрибации в BullMQ
- Сохранение исходного артефакта и транскрипта в `ARTIFACTS_DIR`
- API статуса и результата:
  - `GET /api/v1/jobs/:jobId`
  - `GET /api/v1/jobs/:jobId/result`

## Что реализовано на шаге 6

- `flashcard-worker` как отдельный микросервис генерации карточек
- Строгая JSON-схема колоды/карточек (`FlashcardDeckSchema`) в `@lecture/contracts`
- Детерминированный путь `primary -> retry -> repair -> fallback` для невалидного вывода
- Сохранение результата карточек в артефакт и в Postgres (`flashcards_path`, `flashcards_json`)
- Обновлённый `GET /api/v1/jobs/:jobId/result` возвращает `flashcards`
- Верификация критерия 95% на выборке: `npm run verify:step6`
- Рубрика качества карточек: `docs/step-06-quality-rubric.md`

## Что реализовано на шаге 7

- Карта системных зависимостей MVP: `docs/step-07-system-dependency-map.md`
- Явно зафиксированы блокеры, критический путь и владельцы связей зависимостей
- Добавлены проверяемые контрольные точки по вехам пайплайна

## Что реализовано на шаге 8

- Каталог типовых нарушений JSON и политика снижения риска: `docs/step-08-json-validity-risk.md`
- Детерминированный обработчик невалидного вывода: `primary -> retry -> repair -> fallback`
- Quality gates и политика отклонения (`FLASHCARD_QUALITY_REJECTED`)
- Измерение baseline/target метрик: `npm run verify:step8`

## Что реализовано на шаге 9

- Стратегия long-audio latency risk: `docs/step-09-long-audio-risk-strategy.md`
- Chunking/parallelism планировщик в transcription worker
- Прогресс и timeout-подсказки для in-progress результата (`202 Accepted`)
- Латентностный профиль и SLA/alerts: `docs/step-09-latency-profile.md`
- Верификация шага: `npm run verify:step9`

## Что реализовано на шаге 24

- Интеграция STT-провайдера через абстракцию `TranscriptionProvider`
- Режимы `mock` и `openai` для `transcription-worker`
- Таймауты, retry и маппинг ошибок провайдера в доменные `error_code`
- Сохранение structured transcript результата (`text`, `segments`, `duration`, `language`)
- Документация конфигурации: `docs/step-24-stt-provider.md`
- Верификация шага: `npm run verify:step24`

## Общие пакеты

- `@lecture/contracts` — versioned queue names + payload schemas + queue retention policies
- `@lecture/config` — общий типизированный config module и Redis connection factory
- `@lecture/pipeline` — Postgres repository + artifact helpers

## Профили окружений

- `env/.env.local`
- `env/.env.staging`
- `env/.env.production`

Переключение окружений для compose-команд:

```bash
./scripts/compose.sh local up -d --build
./scripts/compose.sh staging config
./scripts/compose.sh production config
```

## Быстрый старт (local)

```bash
cp .env.example .env
make up
make health
```

## Авторизация API (JWT)

Теперь все рабочие endpoints `api-gateway` требуют Bearer JWT.

Публичные endpoints:
- `GET /health`
- `GET /ready`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/google`
- `POST /api/v1/auth/telegram`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

Защищённые endpoints:
- все остальные `/api/v1/*` (например `POST /api/v1/lectures/ingest`, `GET /api/v1/jobs`, `GET /api/v1/jobs/:jobId/result`, assistant/tests/flashcards endpoints)
- URL-only endpoint: `POST /api/v1/lectures/ingest-url` (`{ sourceUrl, requestedLanguage? }`)
- Video URL endpoint: `POST /api/v1/lectures/ingest-video` (`{ sourceUrl, requestedLanguage? }`)
- включая состояние пользователя:
  - `GET /api/v1/auth/state`
  - `POST /api/v1/auth/state`

Изоляция данных:
- Каждый `job` привязан к владельцу (`owner_user_id`).
- Пользователь может читать/обновлять только свои `job`-ресурсы (`/jobs/:jobId/*`, assistant/tests/flashcards для своего `jobId`).
- Даже при знании чужого `jobId` API возвращает `404`.

Пример получения токена:

```bash
curl -X POST http://localhost:3100/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"admin"}'
```

Пример вызова защищённого endpoint:

```bash
curl -X GET http://localhost:3100/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

JWT/Auth конфиг:
- `AUTH_JWT_ACCESS_SECRET`
- `AUTH_JWT_REFRESH_SECRET`
- `AUTH_JWT_ISSUER`
- `AUTH_JWT_AUDIENCE`
- `AUTH_ACCESS_TTL_SECONDS`
- `AUTH_REFRESH_TTL_SECONDS`
- `AUTH_USER_LOGIN`
- `AUTH_USER_PASSWORD`
- `AUTH_GOOGLE_CLIENT_ID` (optional)
- `AUTH_TELEGRAM_BOT_TOKEN` (optional)
- `AUTH_TELEGRAM_BOT_USERNAME` (optional)

Refresh-сессии сохраняются в Postgres (`auth_refresh_sessions`), поэтому `logout`/`refresh` остаются консистентными после рестарта `api-gateway`.
Состояние демо-пользователя (последний `jobId` и `sessionId`) также хранится в Postgres (`auth_user_state`) и восстанавливается после входа на другом устройстве.

Health endpoints:

- `http://localhost:3100/health`
- `http://localhost:3101/health`
- `http://localhost:3102/health`
- `http://localhost:3103/health`
- `http://localhost:3107/health`
- `http://localhost:3108/health`

## Проверки конфигурации перед деплоем

```bash
./scripts/check-config.sh local
./scripts/check-config.sh staging
./scripts/check-config.sh production
```

## Тесты и CI

Локально:

```bash
make test
make build
make lint
make test-unit
make test-integration
# полный e2e через docker compose:
make test-e2e
```

NPM команды:

```bash
npm run lint
npm run test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:all
npm run verify:step9
npm run verify:step24
```

## OpenRouter (только генерация карточек)

Для `flashcard-worker` можно использовать OpenRouter в OpenAI-совместимом режиме:

```bash
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=openai/gpt-oss-120b:free
OPENAI_API_KEY=<your_openrouter_key>
```

Важно: транскрибация использует endpoint `/audio/transcriptions` и настраивается отдельно через
`TRANSCRIPTION_*` переменные (или fallback на `OPENAI_*`).

## URL parsing через crawl4ai

Для URL-источников `ingestion-service` вызывает отдельный `url-parser-service`, который
парсит страницу через `crawl4ai` и передаёт очищенный текст дальше в текущий pipeline.

Переменные:

- `URL_PARSER_SERVICE_URL` (по умолчанию `http://url-parser-service:8000`)
- `URL_PARSER_TIMEOUT_MS`
- `CRAWL4AI_API_KEY` (если не задан, используется `OPENAI_API_KEY`)
- `CRAWL4AI_LLM_PROVIDER` (пример: `openai/gpt-4.1-mini`)

## Video parsing через yt_dlp

Для видео-ссылок (`YouTube`, `VK Video` и другие поддерживаемые источники) `ingestion-service`
вызывает `video-parser-service`, который скачивает медиа через `yt_dlp` в shared artifacts volume.
После этого запускается обычная транскрибация существующим `transcription-worker`.

Переменные:

- `VIDEO_PARSER_SERVICE_URL` (по умолчанию `http://video-parser-service:8000`)
- `VIDEO_PARSER_TIMEOUT_MS`
- `VIDEO_PARSER_SOCKET_TIMEOUT_SEC`
- `VIDEO_PARSER_FORMAT` (по умолчанию `bestaudio/best`)

## Deepgram (транскрибация)

Для `transcription-worker` можно включить Deepgram:

```bash
TRANSCRIPTION_PROVIDER=deepgram
DEEPGRAM_API_KEY=<your_deepgram_key>
DEEPGRAM_BASE_URL=https://api.deepgram.com/v1
DEEPGRAM_MODEL=nova-3
```

GitHub Actions (`.github/workflows/test.yml`):

- `npm ci`
- `npm run test`
- `npm run build`
- `docker compose config`
- `./scripts/check-config.sh local|staging|production`

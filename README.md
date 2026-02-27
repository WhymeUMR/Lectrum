# Lecture-to-Flashcards

Микросервисный backend-скелет на NestJS + BullMQ.

## Сервисы

- `api-gateway`
- `ingestion-service`
- `transcription-worker`
- `flashcard-worker`
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

Health endpoints:

- `http://localhost:3100/health`
- `http://localhost:3101/health`
- `http://localhost:3102/health`
- `http://localhost:3103/health`

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

GitHub Actions (`.github/workflows/test.yml`):

- `npm ci`
- `npm run test`
- `npm run build`
- `docker compose config`
- `./scripts/check-config.sh local|staging|production`

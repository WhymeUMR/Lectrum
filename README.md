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
```

GitHub Actions (`.github/workflows/test.yml`):

- `npm ci`
- `npm run test`
- `npm run build`
- `docker compose config`
- `./scripts/check-config.sh local|staging|production`

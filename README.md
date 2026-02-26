# Lecture-to-Flashcards

Микросервисный backend-скелет на NestJS + BullMQ.

## Сервисы
- `api-gateway`
- `ingestion-service`
- `transcription-worker`
- `flashcard-worker`
- `redis`
- `postgres`

## Общие пакеты
- `@lecture/contracts` — versioned queue names + payload schemas + queue retention policies
- `@lecture/config` — общий типизированный config module и Redis connection factory

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

## Документация infra
- `docs/infra/redis-environments.md`

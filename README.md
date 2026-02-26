# Lecture-to-Flashcards

Микросервисный backend-скелет на NestJS + BullMQ:
- `api-gateway` (Nest HTTP API + enqueue jobs)
- `ingestion-service` (worker ingestion queue)
- `transcription-worker` (worker transcription queue)
- `flashcard-worker` (worker flashcard queue)
- `redis`
- `postgres`

Также вынесены общие пакеты:
- `@lecture/contracts` — versioned queue names + payload schemas
- `@lecture/config` — общий типизированный config module

## Быстрый старт

1. Подготовить env:
```bash
cp .env.example .env
```

2. Установить зависимости и собрать:
```bash
npm ci
npm run build
```

3. Поднять микросервисный стек:
```bash
make up
```

4. Проверить здоровье:
```bash
make health
```

5. Прогнать тесты:
```bash
make test
```

## Health endpoints

- `http://localhost:3100/health` (`api-gateway`)
- `http://localhost:3101/health` (`ingestion-service`)
- `http://localhost:3102/health` (`transcription-worker`)
- `http://localhost:3103/health` (`flashcard-worker`)

## CI (GitHub)

Workflow: `.github/workflows/test.yml`
- workspace tests (`npm run test`)
- workspace build (`npm run build`)
- `docker compose config`

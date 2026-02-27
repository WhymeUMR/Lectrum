# Step 09 - Long Audio Processing Risk Strategy

## Goal

Снизить риск неприемлемой задержки для длинных лекций в асинхронном пайплайне.

## Implemented strategy

1. Chunking:
   - Транскрибация оценивается как набор chunk-ов (`TRANSCRIPTION_CHUNK_SIZE_CHARS`).
2. Parallelism:
   - Chunk-и обрабатываются волнами с ограничением `TRANSCRIPTION_MAX_PARALLEL_CHUNKS`.
3. Predictable latency profile:
   - Оценка задержки рассчитывается через `waves * TRANSCRIPTION_CHUNK_DELAY_MS`.

Код:
- `services/transcription-worker/src/chunking.ts`
- `services/transcription-worker/src/main.ts`

## User-facing timeout/progress behavior

`GET /api/v1/jobs/:jobId/result`:
- `202 Accepted` для статусов в обработке
- Возвращает:
  - `progress` (0-100 по стадии пайплайна),
  - `recommendedPollIntervalMs`,
  - `expectedMaxProcessingMs`
- `422` для `FAILED` с `errorCode` и `errorMessage`
- `200` для `COMPLETED`

Это позволяет frontend корректно показывать прогресс и политику ожидания без ложного `200 OK` до готовности результата.

## Operational SLA / alert policy

- SLA target (p95 transcription+generation): `<= 18_000 ms`
- Warning threshold: `>= 14_000 ms`
- Critical threshold: `>= 18_000 ms`

Подтверждение и профиль задержек:
- `docs/step-09-latency-profile.md`

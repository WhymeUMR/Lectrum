# Step 07 - MVP System Dependency Map

Единый источник правды по зависимостям MVP, блокерам и критическому пути.

## Таблица зависимостей

| Компонент | Зависит от | Причина зависимости | Уровень блокировки | Владелец связи |
| -- | -- | -- | -- | -- |
| Next.js Upload UI | NestJS Job API (`POST /api/v1/lectures/ingest`) | Старт пайплайна и получение `jobId` | High | Frontend + Backend |
| NestJS Job API | Redis + BullMQ + Postgres | Постановка задач и сохранение статусов | High | Backend + Infra |
| Ingestion Service | Storage artifacts + Transcription queue | Сохранение исходника и передача на транскрибацию | High | Backend |
| Transcription Worker | Ingestion output + Flashcard queue | Формирование транскрипта и постановка генерации карточек | High | Backend + AI |
| Flashcard Worker | Transcript output + JSON schema + LLM config | Генерация валидной колоды карточек | High | AI + Backend |
| Result API (`GET /api/v1/jobs/:jobId/result`) | Flashcard persistence (`flashcards_json`) | Выдача финального результата клиенту | High | Backend |
| Frontend Progress UI | Job status endpoint (`GET /api/v1/jobs/:jobId`) | Отображение этапов `QUEUED -> ... -> COMPLETED` | Medium | Frontend + Backend |
| Monitoring/Alerts | API + workers + Redis/Postgres метрики | SLA и обнаружение сбоев в асинхронной цепочке | Medium | Infra + Backend |

## Блокеры и ограничения последовательности

1. Без Redis/BullMQ пайплайн асинхронных задач не запускается.
2. Без Postgres нет статусов и идемпотентного наблюдения за прогрессом.
3. `flashcard-worker` зависит от наличия транскрипта; запуск до завершения транскрибации невозможен.
4. Результат API не может вернуть `flashcards`, пока не заполнены `flashcards_path` и `flashcards_json`.

## Критический путь MVP

1. Поднять инфраструктуру: `postgres + redis` и health-check сервисов.
2. Пройти ingestion: получить `jobId`, записать source artifact, поставить transcription job.
3. Завершить transcription: сохранить transcript и поставить flashcard job.
4. Завершить flashcard generation: пройти `primary -> retry -> repair -> fallback`, сохранить JSON, выставить `COMPLETED`.
5. Получить результат через Result API и отобразить прогресс/результат на фронтенде.
6. Поддержать операционную устойчивость: мониторинг, retry, идемпотентность.

## Контрольные точки (проверяемые вехи)

1. Infrastructure Ready:
   `make up && make health` возвращает `ok` по всем сервисам.
2. Queue Pipeline Active:
   `POST /api/v1/lectures/ingest` создает job и статус двигается до `TRANSCRIBING`.
3. Flashcard Completion:
   статус проходит `GENERATING_FLASHCARDS -> COMPLETED`, в БД заполнены `flashcards_path`, `flashcards_json`.
4. Result Delivery:
   `GET /api/v1/jobs/:jobId/result` возвращает `flashcards`.
5. Quality Gate:
   `npm run verify:step6` дает PASS (>=95% primary schema pass, 100% final valid).

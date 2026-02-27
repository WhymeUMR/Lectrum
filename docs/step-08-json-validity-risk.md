# Step 08 - Risk: JSON Validity from LLM

## Цель

Снизить риск невалидного/несоответствующего JSON от LLM, который ломает downstream-обработку.

## Каталог типовых нарушений схемы

1. Malformed JSON:
   обрыв структуры, лишние запятые, недостающие кавычки.
2. Wrong field names:
   `front/back` вместо `question/answer`.
3. Extra wrapper text:
   JSON оборачивается префиксами/суффиксами (`text:...:tail`).
4. Semantic quality issues:
   слишком короткие/дублирующие карточки при формально валидной схеме.

## Детерминированный путь обработки

1. `primary`: базовая генерация и строгая schema validation.
2. `retry`: повторная генерация с усиленным system prompt.
3. `repair`: извлечение JSON-кандидата + нормализация формы.
4. `fallback`: безопасная локальная генерация из транскрипта.

Пайплайн реализован в:
- `services/flashcard-worker/src/flashcard-generation.ts`

## Quality gates и политика отклонения

Quality gate проверяет:
- среднюю длину ответа (>= 24 символов),
- среднюю длину вопроса (>= 12 символов),
- долю уникальных вопросов (>= 75%).

Если quality gate не пройден:
- job переводится в `FAILED`,
- код ошибки: `FLASHCARD_QUALITY_REJECTED`,
- причина сохраняется в `error_message`.

## Критерии снижения риска

1. Target final schema pass rate: 100% после `retry/repair/fallback`.
2. Quality gate acceptance rate: >= 95%.
3. Все невалидные варианты проходят через детерминированный путь.

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateQualityGates } = require('../../services/flashcard-worker/dist/quality-gates.js');

test('quality gates accept strong deck', () => {
  const deck = {
    schemaVersion: '1.0',
    lectureId: 'lec-quality',
    generatedAt: new Date().toISOString(),
    cards: [
      {
        sectionTitle: 'Repair path',
        description:
          'Сервис извлекает JSON-кандидат, нормализует поля и повторно валидирует по строгой схеме.',
        keyInfo: 'Нормализация полей + строгая проверка схемы.',
        imagePrompt: 'Пайплайн восстановления JSON'
      },
      {
        sectionTitle: 'Retry',
        description:
          'Retry позволяет получить корректный JSON от модели до перехода на аварийный сценарий.',
        keyInfo: 'Вторая попытка снижает долю fallback-случаев.',
        imagePrompt: 'Диаграмма повторной генерации'
      }
    ]
  };

  const result = evaluateQualityGates(deck);
  assert.equal(result.accepted, true);
  assert.equal(result.reasons.length, 0);
  assert.ok(result.score > 0);
});

test('quality gates reject weak deck', () => {
  const deck = {
    schemaVersion: '1.0',
    lectureId: 'lec-bad',
    generatedAt: new Date().toISOString(),
    cards: [
      { sectionTitle: 'X', description: 'bad', keyInfo: 'bad', imagePrompt: 'x' },
      { sectionTitle: 'X', description: 'bad', keyInfo: 'bad', imagePrompt: 'x' }
    ]
  };

  const result = evaluateQualityGates(deck);
  assert.equal(result.accepted, false);
  assert.ok(result.reasons.length >= 2);
});

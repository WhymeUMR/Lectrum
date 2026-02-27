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
        question: 'Как работает детерминированный repair path?',
        answer:
          'Сервис извлекает JSON-кандидат, нормализует поля и повторно валидирует по строгой схеме.',
        hints: ['repair'],
        tags: ['json', 'reliability'],
        difficulty: 'medium'
      },
      {
        question: 'Зачем нужен retry перед fallback?',
        answer:
          'Retry позволяет получить корректный JSON от модели до перехода на аварийный сценарий.',
        hints: ['retry'],
        tags: ['pipeline'],
        difficulty: 'medium'
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
      { question: 'Q?', answer: 'A', hints: [], tags: [], difficulty: 'easy' },
      { question: 'Q?', answer: 'A', hints: [], tags: [], difficulty: 'easy' }
    ]
  };

  const result = evaluateQualityGates(deck);
  assert.equal(result.accepted, false);
  assert.ok(result.reasons.length >= 2);
});

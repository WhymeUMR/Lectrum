const test = require('node:test');
const assert = require('node:assert/strict');
const { generateFlashcardDeck } = require('../../services/flashcard-worker/dist/flashcard-generation.js');

function payload() {
  return {
    jobId: 'u-1',
    lectureId: 'lec-unit',
    transcriptText:
      'Транскрипт о валидации JSON схемы и детерминированных стратегиях восстановления.',
    maxCards: 5
  };
}

test('generateFlashcardDeck: primary path returns valid deck', async () => {
  const result = await generateFlashcardDeck(payload(), {
    generator: async () =>
      JSON.stringify({
        schemaVersion: '1.0',
        lectureId: 'lec-unit',
        generatedAt: new Date().toISOString(),
        cards: [
          {
            question: 'Что даёт строгая схема?',
            answer: 'Позволяет валидировать формат до сохранения.',
            hints: ['валидация'],
            tags: ['json'],
            difficulty: 'medium'
          }
        ]
      })
  });

  assert.equal(result.report.path, 'primary');
  assert.equal(result.report.finalValid, true);
  assert.equal(result.deck.cards.length, 1);
});

test('generateFlashcardDeck: retry path used when primary invalid', async () => {
  let call = 0;
  const result = await generateFlashcardDeck(payload(), {
    generator: async ({ attempt }) => {
      call += 1;
      if (attempt === 'primary') return 'broken';
      return JSON.stringify({
        schemaVersion: '1.0',
        lectureId: 'lec-unit',
        generatedAt: new Date().toISOString(),
        cards: [
          {
            question: 'Почему нужен retry?',
            answer: 'Чтобы повторить генерацию с более строгим промптом.',
            hints: [],
            tags: ['retry'],
            difficulty: 'medium'
          }
        ]
      });
    }
  });

  assert.equal(call, 2);
  assert.equal(result.report.path, 'retry');
});

test('generateFlashcardDeck: repair path normalizes alternative fields', async () => {
  const result = await generateFlashcardDeck(payload(), {
    generator: async ({ attempt }) => {
      if (attempt === 'primary') return 'broken';
      return `wrapped:${JSON.stringify({
        schemaVersion: '1.0',
        lectureId: 'lec-unit',
        generatedAt: new Date().toISOString(),
        cards: [{ front: 'Вопрос?', back: 'Ответ.' }]
      })}:end`;
    }
  });

  assert.equal(result.report.path, 'repair');
  assert.equal(result.deck.cards[0].question, 'Вопрос?');
  assert.equal(result.deck.cards[0].answer, 'Ответ.');
});

test('generateFlashcardDeck: fallback path returns safe deck when all fails', async () => {
  const result = await generateFlashcardDeck(payload(), {
    generator: async () => 'still-not-json'
  });

  assert.equal(result.report.path, 'fallback');
  assert.ok(result.deck.cards.length >= 1);
});

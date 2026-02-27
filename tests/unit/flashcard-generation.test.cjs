const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateFlashcardDeck,
  FlashcardGenerationError
} = require('../../services/flashcard-worker/dist/flashcard-generation.js');

function payload() {
  return {
    jobId: 'u-1',
    lectureId: 'lec-unit',
    transcriptText:
      'Это длинный учебный текст о том, как проверять гипотезы, сравнивать подходы и делать выводы по результатам эксперимента.',
    maxCards: 3
  };
}

function validCards() {
  return [
    {
      sectionTitle: 'Постановка гипотезы',
      description: 'Сначала формулируется проверяемая гипотеза и критерии успешности до начала эксперимента.',
      keyInfo: 'Гипотеза должна быть измеримой и проверяемой.',
      imagePrompt: 'Схема научного метода и формулировки гипотезы'
    },
    {
      sectionTitle: 'План эксперимента',
      description: 'Далее выбираются метрики и проектируется эксперимент так, чтобы исключить случайные искажения.',
      keyInfo: 'Нужно заранее определить метрики и контрольные условия.',
      imagePrompt: 'Диаграмма с этапами эксперимента и метриками'
    },
    {
      sectionTitle: 'Интерпретация результатов',
      description: 'После сбора данных результаты интерпретируются с учетом ограничений и возможных альтернативных объяснений.',
      keyInfo: 'Выводы должны учитывать ограничения и риски смещения.',
      imagePrompt: 'Иллюстрация анализа данных и формулировки выводов'
    }
  ];
}

test('generateFlashcardDeck: primary path returns valid deck', async () => {
  const result = await generateFlashcardDeck(payload(), {
    generator: async () =>
      JSON.stringify({
        schemaVersion: '1.0',
        lectureId: 'lec-unit',
        generatedAt: new Date().toISOString(),
        cards: validCards()
      })
  });

  assert.equal(result.report.path, 'primary');
  assert.equal(result.report.finalValid, true);
  assert.equal(result.deck.cards.length, 3);
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
        cards: validCards()
      });
    }
  });

  assert.equal(call, 2);
  assert.equal(result.report.path, 'retry');
});

test('generateFlashcardDeck: rejects when AI is unavailable', async () => {
  await assert.rejects(
    () => generateFlashcardDeck(payload(), {}),
    (error) => error instanceof FlashcardGenerationError && error.code === 'FLASHCARD_AI_UNAVAILABLE'
  );
});

test('generateFlashcardDeck: rejects excerpt-like keyInfo instead of summary', async () => {
  const transcript = payload().transcriptText;
  await assert.rejects(
    () =>
      generateFlashcardDeck(payload(), {
        generator: async () =>
          JSON.stringify({
            schemaVersion: '1.0',
            lectureId: 'lec-unit',
            generatedAt: new Date().toISOString(),
            cards: [
              {
                sectionTitle: 'Раздел 1',
                description: 'Это достаточно длинное описание, которое формально проходит минимальные пороги качества.',
                keyInfo: transcript,
                imagePrompt: 'Иллюстрация'
              },
              ...validCards().slice(1)
            ]
          })
      }),
    (error) =>
      error instanceof FlashcardGenerationError &&
      error.code === 'FLASHCARD_AI_INVALID_RESPONSE' &&
      /raw transcript excerpt/i.test(error.message)
  );
});

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MaterialQuizService, QuizGenerationError } from './material-quiz.service';

describe('MaterialQuizService', () => {
  const env = {
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: 'https://api.openai.com/v1',
    OPENAI_MODEL: 'gpt-4.1-mini',
    SUMMARY_AI_TIMEOUT_MS: 60_000
  } as any;

  let service: MaterialQuizService;

  beforeEach(() => {
    service = new MaterialQuizService(env);
  });

  test('gradeQuiz returns score and explanations for mixed answers', () => {
    const quiz = service.parseStoredQuiz(
      JSON.stringify({
        schemaVersion: '1.0',
        generatedAt: new Date().toISOString(),
        language: 'ru',
        difficulty: 'medium',
        questions: [
          {
            id: 'q1',
            type: 'single_choice',
            prompt: 'Выбери верный вариант',
            options: [
              { id: 'a', text: 'A' },
              { id: 'b', text: 'B' }
            ],
            correctOptionIds: ['a'],
            explanation: 'Правильный вариант A.'
          },
          {
            id: 'q2',
            type: 'short_answer',
            prompt: 'Ключевой термин?',
            acceptedAnswers: ['конденсатор'],
            explanation: 'Термин должен быть: конденсатор.'
          }
        ]
      })
    );

    const answers = service.parseAnswers([
      { questionId: 'q1', selectedOptionIds: ['a'] },
      { questionId: 'q2', answerText: 'резистор' }
    ]);

    const result = service.gradeQuiz(quiz, answers);
    assert.equal(result.total, 2);
    assert.equal(result.correct, 1);
    assert.equal(result.percentage, 50);
    assert.equal(result.results[1].correct, false);
    assert.match(result.results[1].explanation, /Термин должен быть/);
  });

  test('generateQuiz throws deterministic error when provider response is invalid', async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"wrong": true}' } }] })
    })) as any;

    try {
      await assert.rejects(
        () =>
          service.generateQuiz({
            lectureId: 'lec-1',
            transcriptText: 'Материал по теме фотосинтеза.',
            transcriptJson: null,
            count: 3,
            difficulty: 'medium',
            language: 'ru'
          }),
        (error) => {
          assert.equal(error instanceof QuizGenerationError, true);
          assert.equal((error as QuizGenerationError).code, 'QUIZ_AI_INVALID_RESPONSE');
          return true;
        }
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('buildFinalStats returns needsWork for wrong answers', () => {
    const quiz = service.parseStoredQuiz(
      JSON.stringify({
        schemaVersion: '1.0',
        generatedAt: new Date().toISOString(),
        language: 'ru',
        difficulty: 'medium',
        questions: [
          {
            id: 'q1',
            type: 'single_choice',
            prompt: 'Что такое фотосинтез?',
            options: [
              { id: 'a', text: 'Процесс синтеза органики из света' },
              { id: 'b', text: 'Тип деления клетки' }
            ],
            correctOptionIds: ['a'],
            explanation: 'Фотосинтез связан с преобразованием энергии света.'
          }
        ]
      })
    );
    const evaluation = service.gradeQuiz(quiz, [{ questionId: 'q1', selectedOptionIds: ['b'] }]);
    const stats = service.buildFinalStats(quiz, evaluation);
    assert.equal(stats.score.percentage, 0);
    assert.equal(stats.wrongCount, 1);
    assert.equal(stats.needsWork.length, 1);
    assert.match(stats.needsWork[0].topic, /фотосинтез/i);
  });
});

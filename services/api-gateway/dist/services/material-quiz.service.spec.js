"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const material_quiz_service_1 = require("./material-quiz.service");
(0, node_test_1.describe)('MaterialQuizService', () => {
    const env = {
        OPENAI_API_KEY: 'test-key',
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
        OPENAI_MODEL: 'gpt-4.1-mini',
        SUMMARY_AI_TIMEOUT_MS: 60_000
    };
    let service;
    (0, node_test_1.beforeEach)(() => {
        service = new material_quiz_service_1.MaterialQuizService(env);
    });
    (0, node_test_1.test)('gradeQuiz returns score and explanations for mixed answers', () => {
        const quiz = service.parseStoredQuiz(JSON.stringify({
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
        }));
        const answers = service.parseAnswers([
            { questionId: 'q1', selectedOptionIds: ['a'] },
            { questionId: 'q2', answerText: 'резистор' }
        ]);
        const result = service.gradeQuiz(quiz, answers);
        strict_1.default.equal(result.total, 2);
        strict_1.default.equal(result.correct, 1);
        strict_1.default.equal(result.percentage, 50);
        strict_1.default.equal(result.results[1].correct, false);
        strict_1.default.match(result.results[1].explanation, /Термин должен быть/);
    });
    (0, node_test_1.test)('generateQuiz throws deterministic error when provider response is invalid', async () => {
        const originalFetch = global.fetch;
        global.fetch = (async () => ({
            ok: true,
            json: async () => ({ choices: [{ message: { content: '{"wrong": true}' } }] })
        }));
        try {
            await strict_1.default.rejects(() => service.generateQuiz({
                lectureId: 'lec-1',
                transcriptText: 'Материал по теме фотосинтеза.',
                transcriptJson: null,
                count: 3,
                difficulty: 'medium',
                language: 'ru'
            }), (error) => {
                strict_1.default.equal(error instanceof material_quiz_service_1.QuizGenerationError, true);
                strict_1.default.equal(error.code, 'QUIZ_AI_INVALID_RESPONSE');
                return true;
            });
        }
        finally {
            global.fetch = originalFetch;
        }
    });
    (0, node_test_1.test)('buildFinalStats returns needsWork for wrong answers', () => {
        const quiz = service.parseStoredQuiz(JSON.stringify({
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
        }));
        const evaluation = service.gradeQuiz(quiz, [{ questionId: 'q1', selectedOptionIds: ['b'] }]);
        const stats = service.buildFinalStats(quiz, evaluation);
        strict_1.default.equal(stats.score.percentage, 0);
        strict_1.default.equal(stats.wrongCount, 1);
        strict_1.default.equal(stats.needsWork.length, 1);
        strict_1.default.match(stats.needsWork[0].topic, /фотосинтез/i);
    });
});
//# sourceMappingURL=material-quiz.service.spec.js.map
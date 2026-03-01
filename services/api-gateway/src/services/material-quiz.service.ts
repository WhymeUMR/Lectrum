import { Inject, Injectable } from '@nestjs/common';
import { APP_ENV, AppEnv } from '@lecture/config';
import { z } from 'zod';

const QUIZ_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

const QuizOptionSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1)
  })
  .strict();

const SingleChoiceQuestionSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('single_choice'),
    prompt: z.string().min(5),
    options: z.array(QuizOptionSchema).min(2).max(6),
    correctOptionIds: z.array(z.string().min(1)).length(1),
    explanation: z.string().min(5)
  })
  .strict();

const MultipleChoiceQuestionSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('multiple_choice'),
    prompt: z.string().min(5),
    options: z.array(QuizOptionSchema).min(3).max(8),
    correctOptionIds: z.array(z.string().min(1)).min(2).max(6),
    explanation: z.string().min(5)
  })
  .strict();

const ShortAnswerQuestionSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('short_answer'),
    prompt: z.string().min(5),
    acceptedAnswers: z.array(z.string().min(1)).min(1).max(6),
    explanation: z.string().min(5)
  })
  .strict();

const QuizQuestionSchema = z.discriminatedUnion('type', [
  SingleChoiceQuestionSchema,
  MultipleChoiceQuestionSchema,
  ShortAnswerQuestionSchema
]);

const StoredQuizSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    generatedAt: z.string().datetime(),
    language: z.string().min(2).max(10),
    difficulty: z.enum(QUIZ_DIFFICULTIES),
    questions: z.array(QuizQuestionSchema).min(1).max(20)
  })
  .strict()
  .superRefine((quiz, ctx) => {
    for (const question of quiz.questions) {
      if (question.type === 'single_choice' || question.type === 'multiple_choice') {
        validateCorrectOptionIds(question.options, question.correctOptionIds, ctx);
      }
    }
  });

const QuizAnswerInputSchema = z
  .object({
    questionId: z.string().min(1),
    selectedOptionIds: z.array(z.string().min(1)).min(1).max(8).optional(),
    answerText: z.string().trim().min(1).max(1000).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.selectedOptionIds && !value.answerText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either selectedOptionIds or answerText is required'
      });
    }
  });

const AI_RESPONSE_SHAPE = {
  schemaVersion: '1.0',
  generatedAt: 'ISO-8601 datetime',
  language: 'string',
  difficulty: 'easy|medium|hard',
  questions: [
    {
      id: 'q1',
      type: 'single_choice',
      prompt: 'string',
      options: [
        { id: 'a', text: '...' },
        { id: 'b', text: '...' }
      ],
      correctOptionIds: ['a'],
      explanation: 'string'
    },
    {
      id: 'q2',
      type: 'multiple_choice',
      prompt: 'string',
      options: [
        { id: 'a', text: '...' },
        { id: 'b', text: '...' },
        { id: 'c', text: '...' }
      ],
      correctOptionIds: ['a', 'c'],
      explanation: 'string'
    },
    {
      id: 'q3',
      type: 'short_answer',
      prompt: 'string',
      acceptedAnswers: ['string'],
      explanation: 'string'
    }
  ]
} as const;

function validateCorrectOptionIds(
  options: Array<{ id: string }>,
  correctOptionIds: string[],
  ctx: z.RefinementCtx
): void {
  const optionIdSet = new Set(options.map((option) => option.id));
  if (optionIdSet.size !== options.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Option ids must be unique'
    });
  }
  const uniqueCorrect = new Set(correctOptionIds);
  if (uniqueCorrect.size !== correctOptionIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'correctOptionIds must be unique'
    });
  }
  for (const id of uniqueCorrect) {
    if (!optionIdSet.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `correctOptionId ${id} does not exist in options`
      });
    }
  }
}

export type StoredQuiz = z.infer<typeof StoredQuizSchema>;
export type QuizAnswerInput = z.infer<typeof QuizAnswerInputSchema>;
export type PublicQuiz = {
  schemaVersion: '1.0';
  generatedAt: string;
  language: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questions: Array<
    | {
        id: string;
        type: 'single_choice' | 'multiple_choice';
        prompt: string;
        options: Array<{ id: string; text: string }>;
      }
    | {
        id: string;
        type: 'short_answer';
        prompt: string;
      }
  >;
};
export type QuizEvaluation = {
  total: number;
  correct: number;
  percentage: number;
  results: Array<{
    questionId: string;
    correct: boolean;
    explanation: string;
    expectedAnswer: string;
    userAnswer: string;
  }>;
};

export class QuizGenerationError extends Error {
  constructor(
    public readonly code:
      | 'QUIZ_AI_HTTP_ERROR'
      | 'QUIZ_AI_INVALID_RESPONSE',
    message: string
  ) {
    super(message);
    this.name = 'QuizGenerationError';
  }
}

@Injectable()
export class MaterialQuizService {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  async generateQuiz(input: {
    lectureId: string;
    transcriptText: string;
    transcriptJson: string | null;
    count: number;
    difficulty: 'easy' | 'medium' | 'hard';
    language: string;
  }): Promise<StoredQuiz> {
    if (!this.env.OPENAI_API_KEY) {
      throw new QuizGenerationError(
        'QUIZ_AI_HTTP_ERROR',
        'OPENAI_API_KEY is required for quiz generation'
      );
    }

    const context = buildQuizContext(input.transcriptText, input.transcriptJson);
    const timeoutMs = Math.max(30_000, Math.floor(this.env.SUMMARY_AI_TIMEOUT_MS));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const requestPayload = {
      model: this.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system' as const,
          content: buildQuizSystemPrompt()
        },
        {
          role: 'user' as const,
          content: JSON.stringify(
            {
              task: 'generate_material_quiz',
              constraints: {
                totalQuestions: input.count,
                difficulty: input.difficulty,
                language: input.language,
                requireAllTypes: ['single_choice', 'multiple_choice', 'short_answer'],
                avoidSemanticDuplicates: true
              },
              outputShape: AI_RESPONSE_SHAPE,
              material: {
                lectureId: input.lectureId,
                context
              }
            },
            null,
            2
          )
        }
      ]
    };

    try {
      let data: { choices?: Array<{ message?: { content?: string } }> };
      try {
        data = await this.requestQuizCompletion(requestPayload, true, controller.signal);
      } catch (error) {
        if (!(error instanceof QuizGenerationError) || error.code !== 'QUIZ_AI_HTTP_ERROR') {
          throw error;
        }
        data = await this.requestQuizCompletion(requestPayload, false, controller.signal);
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new QuizGenerationError('QUIZ_AI_INVALID_RESPONSE', 'Empty quiz response');
      }

      const parsed = parseJsonLoose(content);
      const quiz = StoredQuizSchema.parse(parsed);
      if (quiz.questions.length !== input.count) {
        throw new QuizGenerationError(
          'QUIZ_AI_INVALID_RESPONSE',
          `Expected ${input.count} questions, got ${quiz.questions.length}`
        );
      }
      assertQuestionIdsUnique(quiz);
      assertNoDuplicateQuestions(quiz);
      assertQuestionTypeCoverage(quiz);

      return {
        ...quiz,
        language: input.language,
        difficulty: input.difficulty
      };
    } catch (error) {
      if (error instanceof QuizGenerationError) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new QuizGenerationError('QUIZ_AI_INVALID_RESPONSE', error.message);
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new QuizGenerationError(
          'QUIZ_AI_HTTP_ERROR',
          `Quiz generation timeout after ${timeoutMs}ms`
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new QuizGenerationError('QUIZ_AI_HTTP_ERROR', message);
    } finally {
      clearTimeout(timer);
    }
  }

  private async requestQuizCompletion(
    payload: {
      model: string;
      temperature: number;
      messages: Array<{ role: 'system' | 'user'; content: string }>;
    },
    forceJsonObject: boolean,
    signal: AbortSignal
  ): Promise<{ choices?: Array<{ message?: { content?: string } }> }> {
    const body = forceJsonObject
      ? { ...payload, response_format: { type: 'json_object' as const } }
      : payload;

    const response = await fetch(`${this.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      const details = String(raw || '').slice(0, 300);
      throw new QuizGenerationError(
        'QUIZ_AI_HTTP_ERROR',
        details ? `LLM HTTP ${response.status}: ${details}` : `LLM HTTP ${response.status}`
      );
    }

    return (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  }

  toPublicQuiz(quiz: StoredQuiz): PublicQuiz {
    return {
      schemaVersion: quiz.schemaVersion,
      generatedAt: quiz.generatedAt,
      language: quiz.language,
      difficulty: quiz.difficulty,
      questions: quiz.questions.map((question) => {
        if (question.type === 'short_answer') {
          return {
            id: question.id,
            type: question.type,
            prompt: question.prompt
          };
        }
        const type = question.type === 'single_choice' ? 'single_choice' : 'multiple_choice';
        return {
          id: question.id,
          type,
          prompt: question.prompt,
          options: question.options
        };
      })
    };
  }

  parseStoredQuiz(value: string): StoredQuiz {
    const parsed = parseJsonLoose(value);
    return StoredQuizSchema.parse(parsed);
  }

  parseAnswers(answers: unknown): QuizAnswerInput[] {
    return z.array(QuizAnswerInputSchema).min(1).parse(answers);
  }

  gradeQuiz(quiz: StoredQuiz, answers: QuizAnswerInput[]): QuizEvaluation {
    const answerMap = new Map(answers.map((answer) => [answer.questionId, answer]));

    let correct = 0;
    const results = quiz.questions.map((question) => {
      const answer = answerMap.get(question.id);
      const evaluation = this.evaluateQuestion(question, answer);
      if (evaluation.correct) {
        correct += 1;
      }
      return {
        questionId: question.id,
        ...evaluation
      };
    });

    const total = quiz.questions.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    return {
      total,
      correct,
      percentage,
      results
    };
  }

  buildFinalStats(
    quiz: StoredQuiz,
    evaluation: QuizEvaluation
  ): {
    score: { total: number; correct: number; percentage: number };
    answered: number;
    wrongCount: number;
    needsWork: Array<{ questionId: string; topic: string; recommendation: string }>;
  } {
    const answered = evaluation.results.reduce((acc, item) => (item.userAnswer ? acc + 1 : acc), 0);
    const wrongRows = evaluation.results.filter((item) => !item.correct);
    const questionById = new Map(quiz.questions.map((question) => [question.id, question]));

    const needsWork = wrongRows.map((row) => {
      const question = questionById.get(row.questionId);
      const topic = normalizeTopicLabel(question?.prompt ?? row.questionId);
      const recommendation = String(row.explanation || '').trim() || 'Повторить тему вопроса и проверить терминологию.';
      return {
        questionId: row.questionId,
        topic,
        recommendation
      };
    });

    return {
      score: {
        total: evaluation.total,
        correct: evaluation.correct,
        percentage: evaluation.percentage
      },
      answered,
      wrongCount: wrongRows.length,
      needsWork
    };
  }

  private evaluateQuestion(
    question: StoredQuiz['questions'][number],
    answer: QuizAnswerInput | undefined
  ): {
    correct: boolean;
    explanation: string;
    expectedAnswer: string;
    userAnswer: string;
  } {
    if (question.type === 'short_answer') {
      const userText = String(answer?.answerText ?? '').trim();
      const matched = findBestShortAnswerMatch(question.acceptedAnswers, userText);
      const expectedAnswer = question.acceptedAnswers.join(' / ');
      if (!userText) {
        return {
          correct: false,
          explanation: `Ответ не указан. ${question.explanation}`,
          expectedAnswer,
          userAnswer: ''
        };
      }
      return {
        correct: matched,
        explanation: matched ? 'Верно' : question.explanation,
        expectedAnswer,
        userAnswer: userText
      };
    }

    const selected = normalizeOptionIds(answer?.selectedOptionIds ?? []);
    const expected = normalizeOptionIds(question.correctOptionIds);
    const userAnswer = selected.join(', ');
    const expectedAnswer = expected.join(', ');
    const isCorrect = arraysEqual(selected, expected);

    if (!selected.length) {
      return {
        correct: false,
        explanation: `Ответ не выбран. ${question.explanation}`,
        expectedAnswer,
        userAnswer: ''
      };
    }

    return {
      correct: isCorrect,
      explanation: isCorrect ? 'Верно' : question.explanation,
      expectedAnswer,
      userAnswer
    };
  }
}

function buildQuizSystemPrompt(): string {
  return [
    'You generate quizzes from lecture materials.',
    'Return only valid JSON matching outputShape from the user message.',
    'All questions must be answerable using the provided material context only.',
    'The questions must be semantically distinct and should not repeat the same idea.',
    'Question types must include at least one single_choice, one multiple_choice, and one short_answer when totalQuestions >= 3.',
    'Use concise, unambiguous wording and deterministic option ids.'
  ].join('\n');
}

function buildQuizContext(transcriptText: string, transcriptJson: string | null): {
  transcriptText: string;
  transcriptJson: unknown;
  isTruncated: boolean;
  originalLength: number;
  providedLength: number;
} {
  const maxChars = 18_000;
  const normalized = String(transcriptText || '').replace(/\s+/g, ' ').trim();
  const trimmed = normalized.slice(0, maxChars);
  return {
    transcriptText: trimmed,
    transcriptJson: parseJsonSafe(transcriptJson),
    isTruncated: normalized.length > maxChars,
    originalLength: normalized.length,
    providedLength: trimmed.length
  };
}

function parseJsonLoose(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    const firstBrace = value.indexOf('{');
    const lastBrace = value.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(value.slice(firstBrace, lastBrace + 1));
    }
    throw new QuizGenerationError('QUIZ_AI_INVALID_RESPONSE', 'Response is not valid JSON');
  }
}

function parseJsonSafe(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function assertQuestionIdsUnique(quiz: StoredQuiz): void {
  const ids = quiz.questions.map((question) => question.id);
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new QuizGenerationError('QUIZ_AI_INVALID_RESPONSE', 'Question ids must be unique');
  }
}

function assertQuestionTypeCoverage(quiz: StoredQuiz): void {
  if (quiz.questions.length < 3) {
    return;
  }
  const types = new Set(quiz.questions.map((question) => question.type));
  const required: Array<StoredQuiz['questions'][number]['type']> = [
    'single_choice',
    'multiple_choice',
    'short_answer'
  ];
  for (const type of required) {
    if (!types.has(type)) {
      throw new QuizGenerationError('QUIZ_AI_INVALID_RESPONSE', `Missing required question type: ${type}`);
    }
  }
}

function assertNoDuplicateQuestions(quiz: StoredQuiz): void {
  const normalizedPrompts = quiz.questions.map((question) => normalizeText(question.prompt));
  for (let i = 0; i < normalizedPrompts.length; i += 1) {
    for (let j = i + 1; j < normalizedPrompts.length; j += 1) {
      if (normalizedPrompts[i] === normalizedPrompts[j]) {
        throw new QuizGenerationError('QUIZ_AI_INVALID_RESPONSE', 'Duplicate questions detected');
      }
      const similarity = jaccardSimilarity(normalizedPrompts[i], normalizedPrompts[j]);
      if (similarity >= 0.88) {
        throw new QuizGenerationError(
          'QUIZ_AI_INVALID_RESPONSE',
          'Semantically similar questions detected'
        );
      }
    }
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOptionIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))].sort();
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function jaccardSimilarity(a: string, b: string): number {
  const aSet = new Set(a.split(' ').filter(Boolean));
  const bSet = new Set(b.split(' ').filter(Boolean));
  if (!aSet.size || !bSet.size) return 0;

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  const union = aSet.size + bSet.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function findBestShortAnswerMatch(accepted: string[], userAnswer: string): boolean {
  const normalizedUser = normalizeText(userAnswer);
  if (!normalizedUser) {
    return false;
  }

  for (const candidate of accepted) {
    const normalizedCandidate = normalizeText(candidate);
    if (!normalizedCandidate) {
      continue;
    }
    if (normalizedCandidate === normalizedUser) {
      return true;
    }
    if (normalizedUser.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedUser)) {
      return true;
    }
    if (jaccardSimilarity(normalizedCandidate, normalizedUser) >= 0.8) {
      return true;
    }
  }
  return false;
}

function normalizeTopicLabel(prompt: string): string {
  const normalized = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Неопределенная тема';
  }
  if (normalized.length <= 96) {
    return normalized;
  }
  return `${normalized.slice(0, 93).trim()}...`;
}

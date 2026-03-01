import { AppEnv } from '@lecture/config';
import { z } from 'zod';
declare const StoredQuizSchema: z.ZodEffects<z.ZodObject<{
    schemaVersion: z.ZodLiteral<"1.0">;
    generatedAt: z.ZodString;
    language: z.ZodString;
    difficulty: z.ZodEnum<["easy", "medium", "hard"]>;
    questions: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"single_choice">;
        prompt: z.ZodString;
        options: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            text: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            id: string;
            text: string;
        }, {
            id: string;
            text: string;
        }>, "many">;
        correctOptionIds: z.ZodArray<z.ZodString, "many">;
        explanation: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        id: string;
        options: {
            id: string;
            text: string;
        }[];
        type: "single_choice";
        prompt: string;
        correctOptionIds: string[];
        explanation: string;
    }, {
        id: string;
        options: {
            id: string;
            text: string;
        }[];
        type: "single_choice";
        prompt: string;
        correctOptionIds: string[];
        explanation: string;
    }>, z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"multiple_choice">;
        prompt: z.ZodString;
        options: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            text: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            id: string;
            text: string;
        }, {
            id: string;
            text: string;
        }>, "many">;
        correctOptionIds: z.ZodArray<z.ZodString, "many">;
        explanation: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        id: string;
        options: {
            id: string;
            text: string;
        }[];
        type: "multiple_choice";
        prompt: string;
        correctOptionIds: string[];
        explanation: string;
    }, {
        id: string;
        options: {
            id: string;
            text: string;
        }[];
        type: "multiple_choice";
        prompt: string;
        correctOptionIds: string[];
        explanation: string;
    }>, z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"short_answer">;
        prompt: z.ZodString;
        acceptedAnswers: z.ZodArray<z.ZodString, "many">;
        explanation: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        id: string;
        type: "short_answer";
        prompt: string;
        explanation: string;
        acceptedAnswers: string[];
    }, {
        id: string;
        type: "short_answer";
        prompt: string;
        explanation: string;
        acceptedAnswers: string[];
    }>]>, "many">;
}, "strict", z.ZodTypeAny, {
    difficulty: "easy" | "medium" | "hard";
    language: string;
    schemaVersion: "1.0";
    generatedAt: string;
    questions: ({
        id: string;
        options: {
            id: string;
            text: string;
        }[];
        type: "single_choice";
        prompt: string;
        correctOptionIds: string[];
        explanation: string;
    } | {
        id: string;
        options: {
            id: string;
            text: string;
        }[];
        type: "multiple_choice";
        prompt: string;
        correctOptionIds: string[];
        explanation: string;
    } | {
        id: string;
        type: "short_answer";
        prompt: string;
        explanation: string;
        acceptedAnswers: string[];
    })[];
}, {
    difficulty: "easy" | "medium" | "hard";
    language: string;
    schemaVersion: "1.0";
    generatedAt: string;
    questions: ({
        id: string;
        options: {
            id: string;
            text: string;
        }[];
        type: "single_choice";
        prompt: string;
        correctOptionIds: string[];
        explanation: string;
    } | {
        id: string;
        options: {
            id: string;
            text: string;
        }[];
        type: "multiple_choice";
        prompt: string;
        correctOptionIds: string[];
        explanation: string;
    } | {
        id: string;
        type: "short_answer";
        prompt: string;
        explanation: string;
        acceptedAnswers: string[];
    })[];
}>, {
    difficulty: "easy" | "medium" | "hard";
    language: string;
    schemaVersion: "1.0";
    generatedAt: string;
    questions: ({
        id: string;
        options: {
            id: string;
            text: string;
        }[];
        type: "single_choice";
        prompt: string;
        correctOptionIds: string[];
        explanation: string;
    } | {
        id: string;
        options: {
            id: string;
            text: string;
        }[];
        type: "multiple_choice";
        prompt: string;
        correctOptionIds: string[];
        explanation: string;
    } | {
        id: string;
        type: "short_answer";
        prompt: string;
        explanation: string;
        acceptedAnswers: string[];
    })[];
}, {
    difficulty: "easy" | "medium" | "hard";
    language: string;
    schemaVersion: "1.0";
    generatedAt: string;
    questions: ({
        id: string;
        options: {
            id: string;
            text: string;
        }[];
        type: "single_choice";
        prompt: string;
        correctOptionIds: string[];
        explanation: string;
    } | {
        id: string;
        options: {
            id: string;
            text: string;
        }[];
        type: "multiple_choice";
        prompt: string;
        correctOptionIds: string[];
        explanation: string;
    } | {
        id: string;
        type: "short_answer";
        prompt: string;
        explanation: string;
        acceptedAnswers: string[];
    })[];
}>;
declare const QuizAnswerInputSchema: z.ZodEffects<z.ZodObject<{
    questionId: z.ZodString;
    selectedOptionIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    answerText: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    questionId: string;
    selectedOptionIds?: string[] | undefined;
    answerText?: string | undefined;
}, {
    questionId: string;
    selectedOptionIds?: string[] | undefined;
    answerText?: string | undefined;
}>, {
    questionId: string;
    selectedOptionIds?: string[] | undefined;
    answerText?: string | undefined;
}, {
    questionId: string;
    selectedOptionIds?: string[] | undefined;
    answerText?: string | undefined;
}>;
export type StoredQuiz = z.infer<typeof StoredQuizSchema>;
export type QuizAnswerInput = z.infer<typeof QuizAnswerInputSchema>;
export type PublicQuiz = {
    schemaVersion: '1.0';
    generatedAt: string;
    language: string;
    difficulty: 'easy' | 'medium' | 'hard';
    questions: Array<{
        id: string;
        type: 'single_choice' | 'multiple_choice';
        prompt: string;
        options: Array<{
            id: string;
            text: string;
        }>;
    } | {
        id: string;
        type: 'short_answer';
        prompt: string;
    }>;
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
export declare class QuizGenerationError extends Error {
    readonly code: 'QUIZ_AI_HTTP_ERROR' | 'QUIZ_AI_INVALID_RESPONSE';
    constructor(code: 'QUIZ_AI_HTTP_ERROR' | 'QUIZ_AI_INVALID_RESPONSE', message: string);
}
export declare class MaterialQuizService {
    private readonly env;
    constructor(env: AppEnv);
    generateQuiz(input: {
        lectureId: string;
        transcriptText: string;
        transcriptJson: string | null;
        count: number;
        difficulty: 'easy' | 'medium' | 'hard';
        language: string;
    }): Promise<StoredQuiz>;
    private requestQuizCompletion;
    toPublicQuiz(quiz: StoredQuiz): PublicQuiz;
    parseStoredQuiz(value: string): StoredQuiz;
    parseAnswers(answers: unknown): QuizAnswerInput[];
    gradeQuiz(quiz: StoredQuiz, answers: QuizAnswerInput[]): QuizEvaluation;
    buildFinalStats(quiz: StoredQuiz, evaluation: QuizEvaluation): {
        score: {
            total: number;
            correct: number;
            percentage: number;
        };
        answered: number;
        wrongCount: number;
        needsWork: Array<{
            questionId: string;
            topic: string;
            recommendation: string;
        }>;
    };
    private evaluateQuestion;
}
export {};

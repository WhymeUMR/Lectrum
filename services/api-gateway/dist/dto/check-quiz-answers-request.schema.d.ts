import { z } from 'zod';
export declare const CheckQuizAnswersRequestSchema: z.ZodObject<{
    jobId: z.ZodString;
    answers: z.ZodArray<z.ZodEffects<z.ZodObject<{
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
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    jobId: string;
    answers: {
        questionId: string;
        selectedOptionIds?: string[] | undefined;
        answerText?: string | undefined;
    }[];
}, {
    jobId: string;
    answers: {
        questionId: string;
        selectedOptionIds?: string[] | undefined;
        answerText?: string | undefined;
    }[];
}>;

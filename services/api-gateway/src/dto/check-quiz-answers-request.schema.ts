import { z } from 'zod';

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

export const CheckQuizAnswersRequestSchema = z
  .object({
    jobId: z.string().min(1),
    answers: z.array(QuizAnswerInputSchema).min(1)
  })
  .strict();

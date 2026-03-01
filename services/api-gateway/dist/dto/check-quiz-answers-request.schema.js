"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckQuizAnswersRequestSchema = void 0;
const zod_1 = require("zod");
const QuizAnswerInputSchema = zod_1.z
    .object({
    questionId: zod_1.z.string().min(1),
    selectedOptionIds: zod_1.z.array(zod_1.z.string().min(1)).min(1).max(8).optional(),
    answerText: zod_1.z.string().trim().min(1).max(1000).optional()
})
    .strict()
    .superRefine((value, ctx) => {
    if (!value.selectedOptionIds && !value.answerText) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Either selectedOptionIds or answerText is required'
        });
    }
});
exports.CheckQuizAnswersRequestSchema = zod_1.z
    .object({
    jobId: zod_1.z.string().min(1),
    answers: zod_1.z.array(QuizAnswerInputSchema).min(1)
})
    .strict();
//# sourceMappingURL=check-quiz-answers-request.schema.js.map
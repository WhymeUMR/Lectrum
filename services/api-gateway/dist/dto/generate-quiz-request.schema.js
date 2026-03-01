"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerateQuizRequestSchema = void 0;
const zod_1 = require("zod");
exports.GenerateQuizRequestSchema = zod_1.z
    .object({
    jobId: zod_1.z.string().min(1),
    count: zod_1.z.coerce.number().int().min(1).max(20).default(5),
    difficulty: zod_1.z.enum(['easy', 'medium', 'hard']).default('medium'),
    language: zod_1.z.string().trim().min(2).max(10).default('ru')
})
    .strict();
//# sourceMappingURL=generate-quiz-request.schema.js.map
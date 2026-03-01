import { z } from 'zod';

export const GenerateQuizRequestSchema = z
  .object({
    jobId: z.string().min(1),
    count: z.coerce.number().int().min(1).max(20).default(5),
    difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
    language: z.string().trim().min(2).max(10).default('ru')
  })
  .strict();

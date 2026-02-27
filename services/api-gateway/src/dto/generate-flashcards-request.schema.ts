import { z } from 'zod';

export const GenerateFlashcardsRequestSchema = z.object({
  count: z.coerce.number().int().min(1).max(10).default(5)
});


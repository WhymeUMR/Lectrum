import { z } from 'zod';

export const CreateVideoIngestionRequestSchema = z.object({
  sourceUrl: z.string().url(),
  requestedLanguage: z.string().min(1).optional()
});


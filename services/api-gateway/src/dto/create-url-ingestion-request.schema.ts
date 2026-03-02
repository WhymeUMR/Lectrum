import { z } from 'zod';

export const CreateUrlIngestionRequestSchema = z.object({
  sourceUrl: z.string().url(),
  requestedLanguage: z.string().min(1).optional()
});


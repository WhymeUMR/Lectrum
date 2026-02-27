import { z } from 'zod';
import { GenerateFlashcardsRequestSchema } from './generate-flashcards-request.schema';

export const GenerateFlashcardsByJobRequestSchema = GenerateFlashcardsRequestSchema.extend({
  jobId: z.string().min(1)
});


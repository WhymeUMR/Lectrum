import { z } from 'zod';

export const JOB_CONTRACT_VERSION = 'v1' as const;

export const QUEUE_NAMES = {
  ingestion: `lec.${JOB_CONTRACT_VERSION}.ingestion`,
  transcription: `lec.${JOB_CONTRACT_VERSION}.transcription`,
  flashcard: `lec.${JOB_CONTRACT_VERSION}.flashcard`
} as const;

export const IngestionJobSchema = z.object({
  lectureId: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  filename: z.string().min(1),
  uploadedAt: z.string().datetime()
});

export const TranscriptionJobSchema = z.object({
  lectureId: z.string().min(1),
  storagePath: z.string().min(1),
  language: z.string().default('ru')
});

export const FlashcardGenerationJobSchema = z.object({
  lectureId: z.string().min(1),
  transcriptText: z.string().min(1),
  maxCards: z.number().int().positive().max(100).default(20)
});

export type IngestionJobPayload = z.infer<typeof IngestionJobSchema>;
export type TranscriptionJobPayload = z.infer<typeof TranscriptionJobSchema>;
export type FlashcardGenerationJobPayload = z.infer<typeof FlashcardGenerationJobSchema>;

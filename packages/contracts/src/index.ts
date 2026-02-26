import { z } from 'zod';

export const JOB_CONTRACT_VERSION = 'v1' as const;

export const QUEUE_NAMES = {
  ingestion: `lec.${JOB_CONTRACT_VERSION}.ingestion`,
  transcription: `lec.${JOB_CONTRACT_VERSION}.transcription`,
  flashcard: `lec.${JOB_CONTRACT_VERSION}.flashcard`
} as const;

const defaultRetention = {
  removeOnComplete: { age: 24 * 60 * 60, count: 2000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 }
} as const;

export const QUEUE_POLICIES = {
  ingestion: {
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 2000 },
    ...defaultRetention
  },
  transcription: {
    attempts: 4,
    backoff: { type: 'exponential' as const, delay: 3000 },
    ...defaultRetention
  },
  flashcard: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 4000 },
    ...defaultRetention
  }
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

import { z } from 'zod';

export const JOB_CONTRACT_VERSION = 'v1' as const;

export const QUEUE_NAMES = {
  ingestion: `lec.${JOB_CONTRACT_VERSION}.ingestion`,
  transcription: `lec.${JOB_CONTRACT_VERSION}.transcription`,
  flashcard: `lec.${JOB_CONTRACT_VERSION}.flashcard`,
  highlight: `lec.${JOB_CONTRACT_VERSION}.highlight`,
  summary: `lec.${JOB_CONTRACT_VERSION}.summary`,
  summaryFallback: `lec.${JOB_CONTRACT_VERSION}.summary_fallback`
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
  },
  highlight: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 4000 },
    ...defaultRetention
  },
  summary: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 4000 },
    ...defaultRetention
  },
  summaryFallback: {
    attempts: 2,
    backoff: { type: 'exponential' as const, delay: 5000 },
    ...defaultRetention
  }
} as const;

export const IngestionJobSchema = z.object({
  jobId: z.string().min(1),
  lectureId: z.string().min(1),
  sourceType: z.enum(['upload', 'url', 'video_url']),
  sourceUrl: z.string().url().optional(),
  filename: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  requestedLanguage: z.string().default('ru'),
  uploadedAt: z.string().datetime(),
  fileBase64: z.string().optional()
});

export const TranscriptionJobSchema = z.object({
  jobId: z.string().min(1),
  lectureId: z.string().min(1),
  sourceType: z.enum(['upload', 'url', 'video_url']),
  sourceUrl: z.string().url().optional(),
  storagePath: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  language: z.string().default('ru')
});

export const FlashcardGenerationJobSchema = z.object({
  jobId: z.string().min(1),
  lectureId: z.string().min(1),
  transcriptText: z.string().min(1),
  maxCards: z.number().int().positive().max(10).default(5)
});

export const HighlightGenerationJobSchema = z.object({
  jobId: z.string().min(1),
  lectureId: z.string().min(1),
  transcriptJson: z.string().min(1),
  maxHighlights: z.number().int().positive().max(30).default(30)
});

export const SummaryGenerationJobSchema = z.object({
  jobId: z.string().min(1),
  lectureId: z.string().min(1),
  filename: z.string().min(1),
  transcriptText: z.string().min(1),
  durationSec: z.number().int().nonnegative().default(0)
});

export const FlashcardSchema = z
  .object({
    sectionTitle: z.string().min(3),
    description: z.string().min(10),
    keyInfo: z.string().min(10),
    imagePrompt: z.string().min(3)
  })
  .strict();

export const FlashcardDeckSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    lectureId: z.string().min(1),
    generatedAt: z.string().datetime(),
    cards: z.array(FlashcardSchema).min(1).max(10)
  })
  .strict();

export type IngestionJobPayload = z.infer<typeof IngestionJobSchema>;
export type TranscriptionJobPayload = z.infer<typeof TranscriptionJobSchema>;
export type FlashcardGenerationJobPayload = z.infer<typeof FlashcardGenerationJobSchema>;
export type HighlightGenerationJobPayload = z.infer<typeof HighlightGenerationJobSchema>;
export type SummaryGenerationJobPayload = z.infer<typeof SummaryGenerationJobSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export type FlashcardDeck = z.infer<typeof FlashcardDeckSchema>;

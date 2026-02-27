"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlashcardDeckSchema = exports.FlashcardSchema = exports.FlashcardGenerationJobSchema = exports.TranscriptionJobSchema = exports.IngestionJobSchema = exports.QUEUE_POLICIES = exports.QUEUE_NAMES = exports.JOB_CONTRACT_VERSION = void 0;
const zod_1 = require("zod");
exports.JOB_CONTRACT_VERSION = 'v1';
exports.QUEUE_NAMES = {
    ingestion: `lec.${exports.JOB_CONTRACT_VERSION}.ingestion`,
    transcription: `lec.${exports.JOB_CONTRACT_VERSION}.transcription`,
    flashcard: `lec.${exports.JOB_CONTRACT_VERSION}.flashcard`
};
const defaultRetention = {
    removeOnComplete: { age: 24 * 60 * 60, count: 2000 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 }
};
exports.QUEUE_POLICIES = {
    ingestion: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        ...defaultRetention
    },
    transcription: {
        attempts: 4,
        backoff: { type: 'exponential', delay: 3000 },
        ...defaultRetention
    },
    flashcard: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 4000 },
        ...defaultRetention
    }
};
exports.IngestionJobSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    lectureId: zod_1.z.string().min(1),
    sourceType: zod_1.z.enum(['upload', 'url']),
    sourceUrl: zod_1.z.string().url().optional(),
    filename: zod_1.z.string().min(1),
    mimeType: zod_1.z.string().min(1).optional(),
    requestedLanguage: zod_1.z.string().default('ru'),
    uploadedAt: zod_1.z.string().datetime(),
    fileBase64: zod_1.z.string().optional()
});
exports.TranscriptionJobSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    lectureId: zod_1.z.string().min(1),
    sourceType: zod_1.z.enum(['upload', 'url']),
    sourceUrl: zod_1.z.string().url().optional(),
    storagePath: zod_1.z.string().min(1),
    language: zod_1.z.string().default('ru')
});
exports.FlashcardGenerationJobSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    lectureId: zod_1.z.string().min(1),
    transcriptText: zod_1.z.string().min(1),
    maxCards: zod_1.z.number().int().positive().max(10).default(5)
});
exports.FlashcardSchema = zod_1.z
    .object({
    sectionTitle: zod_1.z.string().min(3),
    description: zod_1.z.string().min(10),
    keyInfo: zod_1.z.string().min(10),
    imagePrompt: zod_1.z.string().min(3)
})
    .strict();
exports.FlashcardDeckSchema = zod_1.z
    .object({
    schemaVersion: zod_1.z.literal('1.0'),
    lectureId: zod_1.z.string().min(1),
    generatedAt: zod_1.z.string().datetime(),
    cards: zod_1.z.array(exports.FlashcardSchema).min(1).max(10)
})
    .strict();
//# sourceMappingURL=index.js.map
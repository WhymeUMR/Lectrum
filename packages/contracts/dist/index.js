"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlashcardGenerationJobSchema = exports.TranscriptionJobSchema = exports.IngestionJobSchema = exports.QUEUE_POLICIES = exports.QUEUE_NAMES = exports.JOB_CONTRACT_VERSION = void 0;
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
    lectureId: zod_1.z.string().min(1),
    sourceUrl: zod_1.z.string().url().optional(),
    filename: zod_1.z.string().min(1),
    uploadedAt: zod_1.z.string().datetime()
});
exports.TranscriptionJobSchema = zod_1.z.object({
    lectureId: zod_1.z.string().min(1),
    storagePath: zod_1.z.string().min(1),
    language: zod_1.z.string().default('ru')
});
exports.FlashcardGenerationJobSchema = zod_1.z.object({
    lectureId: zod_1.z.string().min(1),
    transcriptText: zod_1.z.string().min(1),
    maxCards: zod_1.z.number().int().positive().max(100).default(20)
});
//# sourceMappingURL=index.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlashcardGenerationJobSchema = exports.TranscriptionJobSchema = exports.IngestionJobSchema = exports.QUEUE_NAMES = exports.JOB_CONTRACT_VERSION = void 0;
const zod_1 = require("zod");
exports.JOB_CONTRACT_VERSION = 'v1';
exports.QUEUE_NAMES = {
    ingestion: `lec.${exports.JOB_CONTRACT_VERSION}.ingestion`,
    transcription: `lec.${exports.JOB_CONTRACT_VERSION}.transcription`,
    flashcard: `lec.${exports.JOB_CONTRACT_VERSION}.flashcard`
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
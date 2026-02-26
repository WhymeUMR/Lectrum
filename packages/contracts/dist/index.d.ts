import { z } from 'zod';
export declare const JOB_CONTRACT_VERSION: "v1";
export declare const QUEUE_NAMES: {
    readonly ingestion: "lec.v1.ingestion";
    readonly transcription: "lec.v1.transcription";
    readonly flashcard: "lec.v1.flashcard";
};
export declare const IngestionJobSchema: z.ZodObject<{
    lectureId: z.ZodString;
    sourceUrl: z.ZodOptional<z.ZodString>;
    filename: z.ZodString;
    uploadedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    lectureId: string;
    filename: string;
    uploadedAt: string;
    sourceUrl?: string | undefined;
}, {
    lectureId: string;
    filename: string;
    uploadedAt: string;
    sourceUrl?: string | undefined;
}>;
export declare const TranscriptionJobSchema: z.ZodObject<{
    lectureId: z.ZodString;
    storagePath: z.ZodString;
    language: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    lectureId: string;
    storagePath: string;
    language: string;
}, {
    lectureId: string;
    storagePath: string;
    language?: string | undefined;
}>;
export declare const FlashcardGenerationJobSchema: z.ZodObject<{
    lectureId: z.ZodString;
    transcriptText: z.ZodString;
    maxCards: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    lectureId: string;
    transcriptText: string;
    maxCards: number;
}, {
    lectureId: string;
    transcriptText: string;
    maxCards?: number | undefined;
}>;
export type IngestionJobPayload = z.infer<typeof IngestionJobSchema>;
export type TranscriptionJobPayload = z.infer<typeof TranscriptionJobSchema>;
export type FlashcardGenerationJobPayload = z.infer<typeof FlashcardGenerationJobSchema>;

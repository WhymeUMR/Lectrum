import { z } from 'zod';
export declare const JOB_CONTRACT_VERSION: "v1";
export declare const QUEUE_NAMES: {
    readonly ingestion: "lec.v1.ingestion";
    readonly transcription: "lec.v1.transcription";
    readonly flashcard: "lec.v1.flashcard";
    readonly highlight: "lec.v1.highlight";
    readonly summary: "lec.v1.summary";
    readonly summaryFallback: "lec.v1.summary_fallback";
};
export declare const QUEUE_POLICIES: {
    readonly ingestion: {
        readonly removeOnComplete: {
            readonly age: number;
            readonly count: 2000;
        };
        readonly removeOnFail: {
            readonly age: number;
            readonly count: 5000;
        };
        readonly attempts: 5;
        readonly backoff: {
            readonly type: "exponential";
            readonly delay: 2000;
        };
    };
    readonly transcription: {
        readonly removeOnComplete: {
            readonly age: number;
            readonly count: 2000;
        };
        readonly removeOnFail: {
            readonly age: number;
            readonly count: 5000;
        };
        readonly attempts: 4;
        readonly backoff: {
            readonly type: "exponential";
            readonly delay: 3000;
        };
    };
    readonly flashcard: {
        readonly removeOnComplete: {
            readonly age: number;
            readonly count: 2000;
        };
        readonly removeOnFail: {
            readonly age: number;
            readonly count: 5000;
        };
        readonly attempts: 3;
        readonly backoff: {
            readonly type: "exponential";
            readonly delay: 4000;
        };
    };
    readonly highlight: {
        readonly removeOnComplete: {
            readonly age: number;
            readonly count: 2000;
        };
        readonly removeOnFail: {
            readonly age: number;
            readonly count: 5000;
        };
        readonly attempts: 3;
        readonly backoff: {
            readonly type: "exponential";
            readonly delay: 4000;
        };
    };
    readonly summary: {
        readonly removeOnComplete: {
            readonly age: number;
            readonly count: 2000;
        };
        readonly removeOnFail: {
            readonly age: number;
            readonly count: 5000;
        };
        readonly attempts: 3;
        readonly backoff: {
            readonly type: "exponential";
            readonly delay: 4000;
        };
    };
    readonly summaryFallback: {
        readonly removeOnComplete: {
            readonly age: number;
            readonly count: 2000;
        };
        readonly removeOnFail: {
            readonly age: number;
            readonly count: 5000;
        };
        readonly attempts: 2;
        readonly backoff: {
            readonly type: "exponential";
            readonly delay: 5000;
        };
    };
};
export declare const IngestionJobSchema: z.ZodObject<{
    jobId: z.ZodString;
    lectureId: z.ZodString;
    sourceType: z.ZodEnum<["upload", "url"]>;
    sourceUrl: z.ZodOptional<z.ZodString>;
    filename: z.ZodString;
    mimeType: z.ZodOptional<z.ZodString>;
    requestedLanguage: z.ZodDefault<z.ZodString>;
    uploadedAt: z.ZodString;
    fileBase64: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    jobId: string;
    lectureId: string;
    sourceType: "upload" | "url";
    filename: string;
    requestedLanguage: string;
    uploadedAt: string;
    sourceUrl?: string | undefined;
    mimeType?: string | undefined;
    fileBase64?: string | undefined;
}, {
    jobId: string;
    lectureId: string;
    sourceType: "upload" | "url";
    filename: string;
    uploadedAt: string;
    sourceUrl?: string | undefined;
    mimeType?: string | undefined;
    requestedLanguage?: string | undefined;
    fileBase64?: string | undefined;
}>;
export declare const TranscriptionJobSchema: z.ZodObject<{
    jobId: z.ZodString;
    lectureId: z.ZodString;
    sourceType: z.ZodEnum<["upload", "url"]>;
    sourceUrl: z.ZodOptional<z.ZodString>;
    storagePath: z.ZodString;
    mimeType: z.ZodOptional<z.ZodString>;
    language: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    jobId: string;
    lectureId: string;
    sourceType: "upload" | "url";
    storagePath: string;
    language: string;
    sourceUrl?: string | undefined;
    mimeType?: string | undefined;
}, {
    jobId: string;
    lectureId: string;
    sourceType: "upload" | "url";
    storagePath: string;
    sourceUrl?: string | undefined;
    mimeType?: string | undefined;
    language?: string | undefined;
}>;
export declare const FlashcardGenerationJobSchema: z.ZodObject<{
    jobId: z.ZodString;
    lectureId: z.ZodString;
    transcriptText: z.ZodString;
    maxCards: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    jobId: string;
    lectureId: string;
    transcriptText: string;
    maxCards: number;
}, {
    jobId: string;
    lectureId: string;
    transcriptText: string;
    maxCards?: number | undefined;
}>;
export declare const HighlightGenerationJobSchema: z.ZodObject<{
    jobId: z.ZodString;
    lectureId: z.ZodString;
    transcriptJson: z.ZodString;
    maxHighlights: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    jobId: string;
    lectureId: string;
    transcriptJson: string;
    maxHighlights: number;
}, {
    jobId: string;
    lectureId: string;
    transcriptJson: string;
    maxHighlights?: number | undefined;
}>;
export declare const SummaryGenerationJobSchema: z.ZodObject<{
    jobId: z.ZodString;
    lectureId: z.ZodString;
    filename: z.ZodString;
    transcriptText: z.ZodString;
    durationSec: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    jobId: string;
    lectureId: string;
    filename: string;
    transcriptText: string;
    durationSec: number;
}, {
    jobId: string;
    lectureId: string;
    filename: string;
    transcriptText: string;
    durationSec?: number | undefined;
}>;
export declare const FlashcardSchema: z.ZodObject<{
    sectionTitle: z.ZodString;
    description: z.ZodString;
    keyInfo: z.ZodString;
    imagePrompt: z.ZodString;
}, "strict", z.ZodTypeAny, {
    sectionTitle: string;
    description: string;
    keyInfo: string;
    imagePrompt: string;
}, {
    sectionTitle: string;
    description: string;
    keyInfo: string;
    imagePrompt: string;
}>;
export declare const FlashcardDeckSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<"1.0">;
    lectureId: z.ZodString;
    generatedAt: z.ZodString;
    cards: z.ZodArray<z.ZodObject<{
        sectionTitle: z.ZodString;
        description: z.ZodString;
        keyInfo: z.ZodString;
        imagePrompt: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        sectionTitle: string;
        description: string;
        keyInfo: string;
        imagePrompt: string;
    }, {
        sectionTitle: string;
        description: string;
        keyInfo: string;
        imagePrompt: string;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    lectureId: string;
    schemaVersion: "1.0";
    generatedAt: string;
    cards: {
        sectionTitle: string;
        description: string;
        keyInfo: string;
        imagePrompt: string;
    }[];
}, {
    lectureId: string;
    schemaVersion: "1.0";
    generatedAt: string;
    cards: {
        sectionTitle: string;
        description: string;
        keyInfo: string;
        imagePrompt: string;
    }[];
}>;
export type IngestionJobPayload = z.infer<typeof IngestionJobSchema>;
export type TranscriptionJobPayload = z.infer<typeof TranscriptionJobSchema>;
export type FlashcardGenerationJobPayload = z.infer<typeof FlashcardGenerationJobSchema>;
export type HighlightGenerationJobPayload = z.infer<typeof HighlightGenerationJobSchema>;
export type SummaryGenerationJobPayload = z.infer<typeof SummaryGenerationJobSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export type FlashcardDeck = z.infer<typeof FlashcardDeckSchema>;

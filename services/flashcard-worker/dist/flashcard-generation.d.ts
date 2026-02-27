import { FlashcardDeck, FlashcardGenerationJobPayload } from '@lecture/contracts';
export type GenerationPath = 'primary' | 'retry' | 'repair';
export interface GenerationReport {
    path: GenerationPath;
    primaryValid: boolean;
    finalValid: boolean;
    attempts: number;
}
export interface GenerationOptions {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    timeoutMs?: number;
    generator?: (input: {
        payload: FlashcardGenerationJobPayload;
        systemPrompt: string;
        userPrompt: string;
        attempt: 'primary' | 'retry';
    }) => Promise<string>;
}
export interface GeneratedDeckResult {
    deck: FlashcardDeck;
    report: GenerationReport;
}
export declare class FlashcardGenerationError extends Error {
    readonly code: 'FLASHCARD_AI_UNAVAILABLE' | 'FLASHCARD_AI_HTTP_ERROR' | 'FLASHCARD_AI_INVALID_RESPONSE';
    constructor(code: 'FLASHCARD_AI_UNAVAILABLE' | 'FLASHCARD_AI_HTTP_ERROR' | 'FLASHCARD_AI_INVALID_RESPONSE', message: string);
}
export declare function generateFlashcardDeck(payload: FlashcardGenerationJobPayload, options?: GenerationOptions): Promise<GeneratedDeckResult>;

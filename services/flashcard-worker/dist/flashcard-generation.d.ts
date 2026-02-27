import { FlashcardDeck, FlashcardGenerationJobPayload } from '@lecture/contracts';
export type GenerationPath = 'primary' | 'retry' | 'repair' | 'fallback';
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
export declare function generateFlashcardDeck(payload: FlashcardGenerationJobPayload, options?: GenerationOptions): Promise<GeneratedDeckResult>;

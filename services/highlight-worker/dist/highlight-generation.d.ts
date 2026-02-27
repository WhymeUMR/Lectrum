export interface TranscriptWordLike {
    start?: number;
    end?: number;
    text?: string;
}
export interface TranscriptData {
    text?: string;
    duration?: number;
    segments?: TranscriptWordLike[];
}
export interface TranscriptHighlight {
    start: number;
    end: number;
    text: string;
    reason: string;
}
export declare class HighlightGenerationError extends Error {
    readonly code: 'HIGHLIGHTS_AI_UNAVAILABLE' | 'HIGHLIGHTS_AI_HTTP_ERROR' | 'HIGHLIGHTS_AI_INVALID_RESPONSE';
    constructor(code: 'HIGHLIGHTS_AI_UNAVAILABLE' | 'HIGHLIGHTS_AI_HTTP_ERROR' | 'HIGHLIGHTS_AI_INVALID_RESPONSE', message: string);
}
export interface HighlightGenerationOptions {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
}
export declare function generateHighlights(transcript: TranscriptData, options: HighlightGenerationOptions, maxHighlights?: number): Promise<TranscriptHighlight[]>;

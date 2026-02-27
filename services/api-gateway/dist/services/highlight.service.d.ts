import { AppEnv } from '@lecture/config';
export interface TranscriptWordLike {
    start?: number;
    end?: number;
    text?: string;
}
export interface TranscriptData {
    text?: string;
    segments?: TranscriptWordLike[];
}
export interface TranscriptHighlight {
    start: number;
    end: number;
    text: string;
    reason: string;
}
export declare class HighlightService {
    private readonly env;
    constructor(env: AppEnv);
    getHighlights(transcript: TranscriptData, maxHighlights?: number): Promise<TranscriptHighlight[]>;
    private toChunks;
    private fallbackHighlights;
    private llmHighlights;
}

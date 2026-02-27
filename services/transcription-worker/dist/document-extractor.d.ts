import { TranscriptResult } from './transcription-provider';
export declare class DocumentExtractionError extends Error {
    readonly code: 'DOCUMENT_EXTRACTION_EMPTY_TEXT' | 'DOCUMENT_EXTRACTION_FAILED';
    constructor(code: 'DOCUMENT_EXTRACTION_EMPTY_TEXT' | 'DOCUMENT_EXTRACTION_FAILED', message: string);
}
export declare function isDocumentInput(storagePath: string, mimeType?: string): boolean;
export declare function extractDocumentTranscript(artifactsDir: string, storagePath: string, language: string): Promise<TranscriptResult>;

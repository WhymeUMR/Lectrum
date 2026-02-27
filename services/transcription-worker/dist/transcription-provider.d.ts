export interface TranscriptSegment {
    start: number;
    end: number;
    text: string;
}
export interface TranscriptResult {
    text: string;
    segments: TranscriptSegment[];
    duration: number;
    language: string;
}
export interface TranscriptionRequest {
    artifactsDir: string;
    storagePath: string;
    requestedLanguage: string;
    mimeType?: string;
}
export declare class TranscriptionProviderError extends Error {
    readonly code: 'TRANSCRIPTION_PROVIDER_TIMEOUT' | 'TRANSCRIPTION_PROVIDER_AUTH' | 'TRANSCRIPTION_PROVIDER_RATE_LIMIT' | 'TRANSCRIPTION_PROVIDER_BAD_REQUEST' | 'TRANSCRIPTION_PROVIDER_UNAVAILABLE' | 'TRANSCRIPTION_PROVIDER_ERROR';
    constructor(message: string, code: 'TRANSCRIPTION_PROVIDER_TIMEOUT' | 'TRANSCRIPTION_PROVIDER_AUTH' | 'TRANSCRIPTION_PROVIDER_RATE_LIMIT' | 'TRANSCRIPTION_PROVIDER_BAD_REQUEST' | 'TRANSCRIPTION_PROVIDER_UNAVAILABLE' | 'TRANSCRIPTION_PROVIDER_ERROR');
}
export interface TranscriptionProvider {
    transcribe(req: TranscriptionRequest): Promise<TranscriptResult>;
}
export interface OpenAIProviderOptions {
    apiKey: string;
    baseUrl: string;
    model: string;
    timeoutMs: number;
}
export declare class MockTranscriptionProvider implements TranscriptionProvider {
    transcribe(req: TranscriptionRequest): Promise<TranscriptResult>;
}
export declare class OpenAIWhisperTranscriptionProvider implements TranscriptionProvider {
    private readonly options;
    constructor(options: OpenAIProviderOptions);
    transcribe(req: TranscriptionRequest): Promise<TranscriptResult>;
}
export declare function createTranscriptionProvider(env: {
    TRANSCRIPTION_PROVIDER: 'mock' | 'openai';
    OPENAI_API_KEY?: string;
    OPENAI_BASE_URL?: string;
    TRANSCRIPTION_OPENAI_MODEL: string;
    TRANSCRIPTION_PROVIDER_TIMEOUT_MS: number;
}): TranscriptionProvider;

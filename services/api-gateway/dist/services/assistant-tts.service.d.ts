import { AppEnv } from '@lecture/config';
export declare class AssistantTtsError extends Error {
    readonly code: 'ASSISTANT_TTS_UNAVAILABLE' | 'ASSISTANT_TTS_HTTP_ERROR' | 'ASSISTANT_TTS_INVALID_RESPONSE';
    constructor(code: 'ASSISTANT_TTS_UNAVAILABLE' | 'ASSISTANT_TTS_HTTP_ERROR' | 'ASSISTANT_TTS_INVALID_RESPONSE', message: string);
}
export declare class AssistantTtsService {
    private readonly env;
    constructor(env: AppEnv);
    synthesizeRaw(params: {
        text: string;
        ttsModel?: string;
        ttsVoiceId?: string;
    }): Promise<{
        audioBuffer: Buffer;
        audioMimeType: string;
        model: string;
        chunks: number;
    }>;
    synthesize(params: {
        text: string;
        ttsModel?: string;
        ttsVoiceId?: string;
    }): Promise<{
        audioBase64: string;
        audioMimeType: string;
        model: string;
        chunks: number;
    }>;
    private requestChunkAudio;
    private resolveDefaultVoiceId;
}

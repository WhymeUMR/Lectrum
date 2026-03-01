import { AppEnv } from '@lecture/config';
export type AssistantTtsVoice = {
    voiceId: string;
    name: string;
    language: string;
    category: string;
    previewUrl?: string;
};
export type AssistantTtsWordTiming = {
    text: string;
    startMs: number;
    endMs: number;
};
export declare class AssistantTtsError extends Error {
    readonly code: 'ASSISTANT_TTS_UNAVAILABLE' | 'ASSISTANT_TTS_HTTP_ERROR' | 'ASSISTANT_TTS_INVALID_RESPONSE';
    constructor(code: 'ASSISTANT_TTS_UNAVAILABLE' | 'ASSISTANT_TTS_HTTP_ERROR' | 'ASSISTANT_TTS_INVALID_RESPONSE', message: string);
}
export declare class AssistantTtsService {
    private readonly env;
    constructor(env: AppEnv);
    listVoices(preferredLanguage?: 'ru' | 'en'): Promise<{
        voices: AssistantTtsVoice[];
        defaultVoiceId: string;
        ttsModel: string;
    }>;
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
    synthesizeWithTimestamps(params: {
        text: string;
        ttsModel?: string;
        ttsVoiceId?: string;
    }): Promise<{
        audioBase64: string;
        audioMimeType: string;
        model: string;
        chunks: number;
        words: AssistantTtsWordTiming[];
    }>;
    private requestChunkAudio;
    private requestChunkAudioWithTimestamps;
    private resolveDefaultVoiceId;
    private fetchVoices;
}

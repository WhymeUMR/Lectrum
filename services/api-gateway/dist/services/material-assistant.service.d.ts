import { AppEnv } from '@lecture/config';
export type AssistantHistoryMessage = {
    role: 'user' | 'assistant';
    content: string;
};
export type AssistantCitation = {
    startSec: number;
    endSec: number;
    text: string;
};
export type AssistantWebSource = {
    title: string;
    url: string;
    snippet: string;
};
export type AssistantAnswer = {
    answer: string;
    citations: AssistantCitation[];
    webSources: AssistantWebSource[];
    confidence: number;
    refused: boolean;
    reason: 'ok' | 'web_fallback' | 'no_context';
};
export declare class AssistantGenerationError extends Error {
    readonly code: 'ASSISTANT_AI_HTTP_ERROR' | 'ASSISTANT_AI_INVALID_RESPONSE';
    constructor(code: 'ASSISTANT_AI_HTTP_ERROR' | 'ASSISTANT_AI_INVALID_RESPONSE', message: string);
}
export declare class MaterialAssistantService {
    private readonly env;
    constructor(env: AppEnv);
    ask(params: {
        question: string;
        transcriptText: string;
        transcriptJson: string | null;
        summaryJson: string | null;
        history: AssistantHistoryMessage[];
    }): Promise<AssistantAnswer>;
    private requestLlmAnswer;
    private searchWebSources;
}

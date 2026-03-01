import { z } from 'zod';
export declare const AssistantRecapRequestSchema: z.ZodObject<{
    jobId: z.ZodString;
    sessionId: z.ZodString;
    ttsModel: z.ZodOptional<z.ZodString>;
    ttsVoiceId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    jobId: string;
    sessionId: string;
    ttsModel?: string | undefined;
    ttsVoiceId?: string | undefined;
}, {
    jobId: string;
    sessionId: string;
    ttsModel?: string | undefined;
    ttsVoiceId?: string | undefined;
}>;

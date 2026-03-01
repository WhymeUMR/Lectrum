import { z } from 'zod';
export declare const AssistantTtsPreviewRequestSchema: z.ZodObject<{
    ttsVoiceId: z.ZodString;
    ttsModel: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    ttsVoiceId: string;
    ttsModel?: string | undefined;
    text?: string | undefined;
}, {
    ttsVoiceId: string;
    ttsModel?: string | undefined;
    text?: string | undefined;
}>;

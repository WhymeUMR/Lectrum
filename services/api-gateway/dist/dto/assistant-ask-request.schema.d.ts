import { z } from 'zod';
export declare const AssistantAskRequestSchema: z.ZodObject<{
    jobId: z.ZodString;
    sessionId: z.ZodString;
    question: z.ZodString;
}, "strip", z.ZodTypeAny, {
    jobId: string;
    sessionId: string;
    question: string;
}, {
    jobId: string;
    sessionId: string;
    question: string;
}>;

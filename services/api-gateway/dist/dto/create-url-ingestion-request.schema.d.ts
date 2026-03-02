import { z } from 'zod';
export declare const CreateUrlIngestionRequestSchema: z.ZodObject<{
    sourceUrl: z.ZodString;
    requestedLanguage: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    sourceUrl: string;
    requestedLanguage?: string | undefined;
}, {
    sourceUrl: string;
    requestedLanguage?: string | undefined;
}>;

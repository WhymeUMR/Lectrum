import { z } from 'zod';
export declare const GenerateFlashcardsByJobRequestSchema: z.ZodObject<{
    count: z.ZodDefault<z.ZodNumber>;
} & {
    jobId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    jobId: string;
    count: number;
}, {
    jobId: string;
    count?: number | undefined;
}>;

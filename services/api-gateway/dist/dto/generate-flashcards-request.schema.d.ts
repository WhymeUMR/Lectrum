import { z } from 'zod';
export declare const GenerateFlashcardsRequestSchema: z.ZodObject<{
    count: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    count: number;
}, {
    count?: number | undefined;
}>;

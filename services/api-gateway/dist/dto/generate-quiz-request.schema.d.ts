import { z } from 'zod';
export declare const GenerateQuizRequestSchema: z.ZodObject<{
    jobId: z.ZodString;
    count: z.ZodDefault<z.ZodNumber>;
    difficulty: z.ZodDefault<z.ZodEnum<["easy", "medium", "hard"]>>;
    language: z.ZodDefault<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    jobId: string;
    count: number;
    difficulty: "easy" | "medium" | "hard";
    language: string;
}, {
    jobId: string;
    count?: number | undefined;
    difficulty?: "easy" | "medium" | "hard" | undefined;
    language?: string | undefined;
}>;

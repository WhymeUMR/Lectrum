import { z } from 'zod';
declare const SummarySchema: z.ZodObject<{
    executive_summary: z.ZodString;
    top_takeaways: z.ZodArray<z.ZodString, "many">;
    material_insights: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<["formula", "code", "literature", "concept", "example"]>;
        title: z.ZodString;
        importance: z.ZodString;
        application: z.ZodOptional<z.ZodString>;
        snippet: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "formula" | "code" | "literature" | "concept" | "example";
        title: string;
        importance: string;
        application?: string | undefined;
        snippet?: string | undefined;
    }, {
        kind: "formula" | "code" | "literature" | "concept" | "example";
        title: string;
        importance: string;
        application?: string | undefined;
        snippet?: string | undefined;
    }>, "many">;
    entities: z.ZodObject<{
        people: z.ZodArray<z.ZodString, "many">;
        concepts: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        people: string[];
        concepts: string[];
    }, {
        people: string[];
        concepts: string[];
    }>;
}, "strip", z.ZodTypeAny, {
    executive_summary: string;
    top_takeaways: string[];
    material_insights: {
        kind: "formula" | "code" | "literature" | "concept" | "example";
        title: string;
        importance: string;
        application?: string | undefined;
        snippet?: string | undefined;
    }[];
    entities: {
        people: string[];
        concepts: string[];
    };
}, {
    executive_summary: string;
    top_takeaways: string[];
    material_insights: {
        kind: "formula" | "code" | "literature" | "concept" | "example";
        title: string;
        importance: string;
        application?: string | undefined;
        snippet?: string | undefined;
    }[];
    entities: {
        people: string[];
        concepts: string[];
    };
}>;
export type LectureSummary = z.infer<typeof SummarySchema>;
export declare class SummaryGenerationError extends Error {
    readonly code: 'SUMMARY_AI_UNAVAILABLE' | 'SUMMARY_AI_HTTP_ERROR' | 'SUMMARY_AI_INVALID_RESPONSE';
    constructor(code: 'SUMMARY_AI_UNAVAILABLE' | 'SUMMARY_AI_HTTP_ERROR' | 'SUMMARY_AI_INVALID_RESPONSE', message: string);
}
export interface SummarySourceInput {
    title: string;
    transcriptText: string;
    durationSec?: number;
}
export interface SummaryGenerationOptions {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    timeoutMs?: number;
}
export declare function generateSummary(input: SummarySourceInput, options: SummaryGenerationOptions): Promise<LectureSummary>;
export {};

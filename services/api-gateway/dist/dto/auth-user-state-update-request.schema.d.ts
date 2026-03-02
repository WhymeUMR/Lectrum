import { z } from 'zod';
export declare const AuthUserStateUpdateRequestSchema: z.ZodObject<{
    lastJobId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    assistantSessionId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
}, "strip", z.ZodTypeAny, {
    lastJobId?: string | null | undefined;
    assistantSessionId?: string | null | undefined;
}, {
    lastJobId?: string | null | undefined;
    assistantSessionId?: string | null | undefined;
}>;

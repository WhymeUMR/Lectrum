import { z } from 'zod';
export declare const AuthLoginRequestSchema: z.ZodObject<{
    login: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    login: string;
    password: string;
}, {
    login: string;
    password: string;
}>;

import { z } from 'zod';
export declare const AuthTelegramRequestSchema: z.ZodObject<{
    id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    first_name: z.ZodOptional<z.ZodString>;
    last_name: z.ZodOptional<z.ZodString>;
    username: z.ZodOptional<z.ZodString>;
    photo_url: z.ZodOptional<z.ZodString>;
    auth_date: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    hash: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string | number;
    auth_date: string | number;
    hash: string;
    first_name?: string | undefined;
    last_name?: string | undefined;
    username?: string | undefined;
    photo_url?: string | undefined;
}, {
    id: string | number;
    auth_date: string | number;
    hash: string;
    first_name?: string | undefined;
    last_name?: string | undefined;
    username?: string | undefined;
    photo_url?: string | undefined;
}>;

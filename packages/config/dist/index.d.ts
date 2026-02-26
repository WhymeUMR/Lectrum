import { DynamicModule } from '@nestjs/common';
import { z } from 'zod';
declare const EnvSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "test", "production"]>>;
    SERVICE_NAME: z.ZodString;
    PORT: z.ZodDefault<z.ZodNumber>;
    REDIS_URL: z.ZodString;
    DATABASE_URL: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    NODE_ENV: "development" | "test" | "production";
    SERVICE_NAME: string;
    PORT: number;
    REDIS_URL: string;
    DATABASE_URL?: string | undefined;
}, {
    SERVICE_NAME: string;
    REDIS_URL: string;
    NODE_ENV?: "development" | "test" | "production" | undefined;
    PORT?: number | undefined;
    DATABASE_URL?: string | undefined;
}>;
export type AppEnv = z.infer<typeof EnvSchema>;
export declare const APP_ENV: unique symbol;
export declare class SharedConfigModule {
    static forRoot(serviceName: string): DynamicModule;
}
export {};

import { DynamicModule } from '@nestjs/common';
import { z } from 'zod';
declare const EnvSchema: z.ZodObject<{
    APP_ENV: z.ZodDefault<z.ZodEnum<["local", "staging", "production"]>>;
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "test", "production"]>>;
    SERVICE_NAME: z.ZodString;
    PORT: z.ZodDefault<z.ZodNumber>;
    REDIS_URL: z.ZodString;
    REDIS_QUEUE_PREFIX: z.ZodDefault<z.ZodString>;
    REDIS_DB: z.ZodDefault<z.ZodNumber>;
    REDIS_CONNECT_TIMEOUT_MS: z.ZodDefault<z.ZodNumber>;
    REDIS_MAX_RETRIES_PER_REQUEST: z.ZodDefault<z.ZodNumber>;
    REDIS_ENABLE_TLS: z.ZodDefault<z.ZodEffects<z.ZodBoolean, boolean, unknown>>;
    DATABASE_URL: z.ZodOptional<z.ZodString>;
    ARTIFACTS_DIR: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    APP_ENV: "local" | "staging" | "production";
    NODE_ENV: "production" | "development" | "test";
    SERVICE_NAME: string;
    PORT: number;
    REDIS_URL: string;
    REDIS_QUEUE_PREFIX: string;
    REDIS_DB: number;
    REDIS_CONNECT_TIMEOUT_MS: number;
    REDIS_MAX_RETRIES_PER_REQUEST: number;
    REDIS_ENABLE_TLS: boolean;
    ARTIFACTS_DIR: string;
    DATABASE_URL?: string | undefined;
}, {
    SERVICE_NAME: string;
    REDIS_URL: string;
    APP_ENV?: "local" | "staging" | "production" | undefined;
    NODE_ENV?: "production" | "development" | "test" | undefined;
    PORT?: number | undefined;
    REDIS_QUEUE_PREFIX?: string | undefined;
    REDIS_DB?: number | undefined;
    REDIS_CONNECT_TIMEOUT_MS?: number | undefined;
    REDIS_MAX_RETRIES_PER_REQUEST?: number | undefined;
    REDIS_ENABLE_TLS?: unknown;
    DATABASE_URL?: string | undefined;
    ARTIFACTS_DIR?: string | undefined;
}>;
export type AppEnv = z.infer<typeof EnvSchema>;
export declare const APP_ENV: unique symbol;
export declare function buildRedisConnection(env: AppEnv): {
    connection: {
        url: string;
        db: number;
        connectTimeout: number;
        maxRetriesPerRequest: number;
        tls: {} | undefined;
    };
    prefix: string;
};
export declare class SharedConfigModule {
    static forRoot(serviceName: string): DynamicModule;
}
export {};

import { DynamicModule, Global, Module } from '@nestjs/common';
import { z } from 'zod';

const EnvSchema = z.object({
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  REDIS_URL: z.string().url(),
  REDIS_QUEUE_PREFIX: z.string().min(1).default('lec.local'),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  REDIS_MAX_RETRIES_PER_REQUEST: z.coerce.number().int().min(1).max(20).default(3),
  REDIS_ENABLE_TLS: z
    .preprocess((v) => v === 'true' || v === true, z.boolean())
    .default(false),
  DATABASE_URL: z.string().min(1).optional()
});

export type AppEnv = z.infer<typeof EnvSchema>;
export const APP_ENV = Symbol('APP_ENV');

function loadEnv(serviceName: string): AppEnv {
  return EnvSchema.parse({
    APP_ENV: process.env.APP_ENV,
    NODE_ENV: process.env.NODE_ENV,
    SERVICE_NAME: process.env.SERVICE_NAME ?? serviceName,
    PORT: process.env.PORT,
    REDIS_URL: process.env.REDIS_URL,
    REDIS_QUEUE_PREFIX: process.env.REDIS_QUEUE_PREFIX,
    REDIS_DB: process.env.REDIS_DB,
    REDIS_CONNECT_TIMEOUT_MS: process.env.REDIS_CONNECT_TIMEOUT_MS,
    REDIS_MAX_RETRIES_PER_REQUEST: process.env.REDIS_MAX_RETRIES_PER_REQUEST,
    REDIS_ENABLE_TLS: process.env.REDIS_ENABLE_TLS,
    DATABASE_URL: process.env.DATABASE_URL
  });
}

export function buildRedisConnection(env: AppEnv) {
  return {
    connection: {
      url: env.REDIS_URL,
      db: env.REDIS_DB,
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
      maxRetriesPerRequest: env.REDIS_MAX_RETRIES_PER_REQUEST,
      tls: env.REDIS_ENABLE_TLS ? {} : undefined
    },
    prefix: env.REDIS_QUEUE_PREFIX
  };
}

@Global()
@Module({})
export class SharedConfigModule {
  static forRoot(serviceName: string): DynamicModule {
    return {
      module: SharedConfigModule,
      providers: [
        {
          provide: APP_ENV,
          useFactory: () => loadEnv(serviceName)
        }
      ],
      exports: [APP_ENV]
    };
  }
}

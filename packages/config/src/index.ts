import { DynamicModule, Global, Module } from '@nestjs/common';
import { z } from 'zod';

const emptyToUndefined = (value: unknown) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
};

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
  REDIS_ENABLE_TLS: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  TRANSCRIPTION_CHUNK_SIZE_CHARS: z.coerce.number().int().positive().default(800),
  TRANSCRIPTION_MAX_PARALLEL_CHUNKS: z.coerce.number().int().positive().default(4),
  TRANSCRIPTION_CHUNK_DELAY_MS: z.coerce.number().int().positive().default(25),
  JOB_RESULT_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  JOB_EXPECTED_MAX_PROCESSING_MS: z.coerce.number().int().positive().default(900000),
  UPLOAD_MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(200 * 1024 * 1024),
  TRANSCRIPTION_PROVIDER: z.enum(['mock', 'openai', 'deepgram']).default('mock'),
  TRANSCRIPTION_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  TRANSCRIPTION_PROVIDER_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  TRANSCRIPTION_PROVIDER_RETRY_DELAY_MS: z.coerce.number().int().positive().default(1000),
  TRANSCRIPTION_OPENAI_MODEL: z.string().min(1).default('whisper-1'),
  TRANSCRIPTION_OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  TRANSCRIPTION_OPENAI_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  DEEPGRAM_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  DEEPGRAM_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  DEEPGRAM_MODEL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  DATABASE_URL: z.string().min(1).optional(),
  ARTIFACTS_DIR: z.string().min(1).default('/app/storage'),
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  OPENAI_FALLBACK_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  OPENAI_MODEL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  OPENAI_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  SUMMARY_AI_TIMEOUT_MS: z.coerce.number().int().positive().default(180000)
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
    TRANSCRIPTION_CHUNK_SIZE_CHARS: process.env.TRANSCRIPTION_CHUNK_SIZE_CHARS,
    TRANSCRIPTION_MAX_PARALLEL_CHUNKS: process.env.TRANSCRIPTION_MAX_PARALLEL_CHUNKS,
    TRANSCRIPTION_CHUNK_DELAY_MS: process.env.TRANSCRIPTION_CHUNK_DELAY_MS,
    JOB_RESULT_POLL_INTERVAL_MS: process.env.JOB_RESULT_POLL_INTERVAL_MS,
    JOB_EXPECTED_MAX_PROCESSING_MS: process.env.JOB_EXPECTED_MAX_PROCESSING_MS,
    UPLOAD_MAX_FILE_SIZE_BYTES: process.env.UPLOAD_MAX_FILE_SIZE_BYTES,
    TRANSCRIPTION_PROVIDER: process.env.TRANSCRIPTION_PROVIDER,
    TRANSCRIPTION_PROVIDER_TIMEOUT_MS: process.env.TRANSCRIPTION_PROVIDER_TIMEOUT_MS,
    TRANSCRIPTION_PROVIDER_RETRY_ATTEMPTS: process.env.TRANSCRIPTION_PROVIDER_RETRY_ATTEMPTS,
    TRANSCRIPTION_PROVIDER_RETRY_DELAY_MS: process.env.TRANSCRIPTION_PROVIDER_RETRY_DELAY_MS,
    TRANSCRIPTION_OPENAI_MODEL: process.env.TRANSCRIPTION_OPENAI_MODEL,
    TRANSCRIPTION_OPENAI_API_KEY: process.env.TRANSCRIPTION_OPENAI_API_KEY,
    TRANSCRIPTION_OPENAI_BASE_URL: process.env.TRANSCRIPTION_OPENAI_BASE_URL,
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    DEEPGRAM_BASE_URL: process.env.DEEPGRAM_BASE_URL,
    DEEPGRAM_MODEL: process.env.DEEPGRAM_MODEL,
    DATABASE_URL: process.env.DATABASE_URL,
    ARTIFACTS_DIR: process.env.ARTIFACTS_DIR,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_FALLBACK_API_KEY: process.env.OPENAI_FALLBACK_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    SUMMARY_AI_TIMEOUT_MS: process.env.SUMMARY_AI_TIMEOUT_MS
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

"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var SharedConfigModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharedConfigModule = exports.APP_ENV = void 0;
exports.buildRedisConnection = buildRedisConnection;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const emptyToUndefined = (value) => {
    if (typeof value === 'string' && value.trim() === '') {
        return undefined;
    }
    return value;
};
const EnvSchema = zod_1.z.object({
    APP_ENV: zod_1.z.enum(['local', 'staging', 'production']).default('local'),
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    SERVICE_NAME: zod_1.z.string().min(1),
    PORT: zod_1.z.coerce.number().int().positive().default(3000),
    REDIS_URL: zod_1.z.string().url(),
    REDIS_QUEUE_PREFIX: zod_1.z.string().min(1).default('lec.local'),
    REDIS_DB: zod_1.z.coerce.number().int().min(0).max(15).default(0),
    REDIS_CONNECT_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(5000),
    REDIS_MAX_RETRIES_PER_REQUEST: zod_1.z.coerce.number().int().min(1).max(20).default(3),
    REDIS_ENABLE_TLS: zod_1.z.preprocess((v) => v === 'true' || v === true, zod_1.z.boolean()).default(false),
    TRANSCRIPTION_CHUNK_SIZE_CHARS: zod_1.z.coerce.number().int().positive().default(800),
    TRANSCRIPTION_MAX_PARALLEL_CHUNKS: zod_1.z.coerce.number().int().positive().default(4),
    TRANSCRIPTION_CHUNK_DELAY_MS: zod_1.z.coerce.number().int().positive().default(25),
    JOB_RESULT_POLL_INTERVAL_MS: zod_1.z.coerce.number().int().positive().default(2000),
    JOB_EXPECTED_MAX_PROCESSING_MS: zod_1.z.coerce.number().int().positive().default(900000),
    UPLOAD_MAX_FILE_SIZE_BYTES: zod_1.z.coerce.number().int().positive().default(100 * 1024 * 1024),
    TRANSCRIPTION_PROVIDER: zod_1.z.enum(['mock', 'openai', 'deepgram']).default('mock'),
    TRANSCRIPTION_PROVIDER_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(120000),
    TRANSCRIPTION_PROVIDER_RETRY_ATTEMPTS: zod_1.z.coerce.number().int().min(1).max(5).default(2),
    TRANSCRIPTION_PROVIDER_RETRY_DELAY_MS: zod_1.z.coerce.number().int().positive().default(1000),
    TRANSCRIPTION_OPENAI_MODEL: zod_1.z.string().min(1).default('whisper-1'),
    TRANSCRIPTION_OPENAI_API_KEY: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().min(1).optional()),
    TRANSCRIPTION_OPENAI_BASE_URL: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().url().optional()),
    DEEPGRAM_API_KEY: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().min(1).optional()),
    DEEPGRAM_BASE_URL: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().url().optional()),
    DEEPGRAM_MODEL: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().min(1).optional()),
    ELEVENLABS_API_KEY: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().min(1).optional()),
    ELEVENLABS_BASE_URL: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().url().optional()),
    ELEVENLABS_TTS_MODEL: zod_1.z.string().min(1).default('eleven_multilingual_v2'),
    ELEVENLABS_VOICE_ID: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().min(1).optional()),
    ELEVENLABS_OUTPUT_FORMAT: zod_1.z.string().min(1).default('mp3_44100_128'),
    DATABASE_URL: zod_1.z.string().min(1).optional(),
    ARTIFACTS_DIR: zod_1.z.string().min(1).default('/app/storage'),
    OPENAI_API_KEY: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().min(1).optional()),
    OPENAI_FALLBACK_API_KEY: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().min(1).optional()),
    OPENAI_MODEL: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().min(1).optional()),
    OPENAI_BASE_URL: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().url().optional()),
    URL_PARSER_SERVICE_URL: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().url().optional()),
    URL_PARSER_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(180000),
    SUMMARY_AI_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(180000),
    AUTH_JWT_ACCESS_SECRET: zod_1.z.string().min(32).default('dev-access-secret-change-me-at-least-32-chars'),
    AUTH_JWT_REFRESH_SECRET: zod_1.z.string().min(32).default('dev-refresh-secret-change-me-at-least-32-chars'),
    AUTH_JWT_ISSUER: zod_1.z.string().min(1).default('lecture-api'),
    AUTH_JWT_AUDIENCE: zod_1.z.string().min(1).default('lecture-client'),
    AUTH_ACCESS_TTL_SECONDS: zod_1.z.coerce.number().int().positive().default(900),
    AUTH_REFRESH_TTL_SECONDS: zod_1.z.coerce.number().int().positive().default(2592000),
    AUTH_USER_LOGIN: zod_1.z.string().min(1).default('admin'),
    AUTH_USER_PASSWORD: zod_1.z.string().min(1).default('admin'),
    AUTH_GOOGLE_CLIENT_ID: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().min(1).optional()),
    AUTH_TELEGRAM_BOT_TOKEN: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().min(1).optional()),
    AUTH_TELEGRAM_BOT_USERNAME: zod_1.z.preprocess(emptyToUndefined, zod_1.z.string().min(1).optional())
});
exports.APP_ENV = Symbol('APP_ENV');
function loadEnv(serviceName) {
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
        ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
        ELEVENLABS_BASE_URL: process.env.ELEVENLABS_BASE_URL,
        ELEVENLABS_TTS_MODEL: process.env.ELEVENLABS_TTS_MODEL,
        ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
        ELEVENLABS_OUTPUT_FORMAT: process.env.ELEVENLABS_OUTPUT_FORMAT,
        DATABASE_URL: process.env.DATABASE_URL,
        ARTIFACTS_DIR: process.env.ARTIFACTS_DIR,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_FALLBACK_API_KEY: process.env.OPENAI_FALLBACK_API_KEY,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
        URL_PARSER_SERVICE_URL: process.env.URL_PARSER_SERVICE_URL,
        URL_PARSER_TIMEOUT_MS: process.env.URL_PARSER_TIMEOUT_MS,
        SUMMARY_AI_TIMEOUT_MS: process.env.SUMMARY_AI_TIMEOUT_MS,
        AUTH_JWT_ACCESS_SECRET: process.env.AUTH_JWT_ACCESS_SECRET,
        AUTH_JWT_REFRESH_SECRET: process.env.AUTH_JWT_REFRESH_SECRET,
        AUTH_JWT_ISSUER: process.env.AUTH_JWT_ISSUER,
        AUTH_JWT_AUDIENCE: process.env.AUTH_JWT_AUDIENCE,
        AUTH_ACCESS_TTL_SECONDS: process.env.AUTH_ACCESS_TTL_SECONDS,
        AUTH_REFRESH_TTL_SECONDS: process.env.AUTH_REFRESH_TTL_SECONDS,
        AUTH_USER_LOGIN: process.env.AUTH_USER_LOGIN,
        AUTH_USER_PASSWORD: process.env.AUTH_USER_PASSWORD,
        AUTH_GOOGLE_CLIENT_ID: process.env.AUTH_GOOGLE_CLIENT_ID,
        AUTH_TELEGRAM_BOT_TOKEN: process.env.AUTH_TELEGRAM_BOT_TOKEN,
        AUTH_TELEGRAM_BOT_USERNAME: process.env.AUTH_TELEGRAM_BOT_USERNAME
    });
}
function buildRedisConnection(env) {
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
let SharedConfigModule = SharedConfigModule_1 = class SharedConfigModule {
    static forRoot(serviceName) {
        return {
            module: SharedConfigModule_1,
            providers: [
                {
                    provide: exports.APP_ENV,
                    useFactory: () => loadEnv(serviceName)
                }
            ],
            exports: [exports.APP_ENV]
        };
    }
};
exports.SharedConfigModule = SharedConfigModule;
exports.SharedConfigModule = SharedConfigModule = SharedConfigModule_1 = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({})
], SharedConfigModule);
//# sourceMappingURL=index.js.map
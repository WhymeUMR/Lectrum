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
    DATABASE_URL: zod_1.z.string().min(1).optional(),
    ARTIFACTS_DIR: zod_1.z.string().min(1).default('/app/storage'),
    OPENAI_API_KEY: zod_1.z.string().min(1).optional(),
    OPENAI_MODEL: zod_1.z.string().min(1).optional(),
    OPENAI_BASE_URL: zod_1.z.string().url().optional()
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
        DATABASE_URL: process.env.DATABASE_URL,
        ARTIFACTS_DIR: process.env.ARTIFACTS_DIR,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL
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
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
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const EnvSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    SERVICE_NAME: zod_1.z.string().min(1),
    PORT: zod_1.z.coerce.number().int().positive().default(3000),
    REDIS_URL: zod_1.z.string().url(),
    DATABASE_URL: zod_1.z.string().min(1).optional()
});
exports.APP_ENV = Symbol('APP_ENV');
function loadEnv(serviceName) {
    return EnvSchema.parse({
        NODE_ENV: process.env.NODE_ENV,
        SERVICE_NAME: process.env.SERVICE_NAME ?? serviceName,
        PORT: process.env.PORT,
        REDIS_URL: process.env.REDIS_URL,
        DATABASE_URL: process.env.DATABASE_URL
    });
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
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const bullmq_1 = require("bullmq");
const contracts_1 = require("@lecture/contracts");
const config_1 = require("@lecture/config");
let FlashcardProcessor = class FlashcardProcessor {
    constructor(env) {
        this.env = env;
    }
    onModuleInit() {
        const connection = { connection: { url: this.env.REDIS_URL } };
        this.worker = new bullmq_1.Worker(contracts_1.QUEUE_NAMES.flashcard, async (job) => {
            console.log(`Generated ${job.data.maxCards} cards for lecture ${job.data.lectureId}`);
        }, connection);
    }
    async onModuleDestroy() {
        await this.worker?.close();
    }
};
FlashcardProcessor = __decorate([
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object])
], FlashcardProcessor);
let AppController = class AppController {
    constructor(env) {
        this.env = env;
    }
    health() {
        return { status: 'ok', service: this.env.SERVICE_NAME, queue: contracts_1.QUEUE_NAMES.flashcard };
    }
    ready() {
        return { status: 'ready' };
    }
};
__decorate([
    (0, common_1.Get)('/health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('/ready'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppController.prototype, "ready", null);
AppController = __decorate([
    (0, common_1.Controller)(),
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object])
], AppController);
let AppModule = class AppModule {
};
AppModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.SharedConfigModule.forRoot('flashcard-worker')],
        controllers: [AppController],
        providers: [FlashcardProcessor]
    })
], AppModule);
async function bootstrap() {
    const app = await core_1.NestFactory.create(AppModule);
    const env = app.get(config_1.APP_ENV);
    await app.listen(env.PORT, '0.0.0.0');
}
bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map
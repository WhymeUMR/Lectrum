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
exports.QueueService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const contracts_1 = require("@lecture/contracts");
const config_1 = require("@lecture/config");
let QueueService = class QueueService {
    constructor(env) {
        this.env = env;
        const redis = (0, config_1.buildRedisConnection)(env);
        this.ingestionQueue = new bullmq_1.Queue(contracts_1.QUEUE_NAMES.ingestion, {
            ...redis,
            defaultJobOptions: contracts_1.QUEUE_POLICIES.ingestion
        });
        this.flashcardQueue = new bullmq_1.Queue(contracts_1.QUEUE_NAMES.flashcard, {
            ...redis,
            defaultJobOptions: contracts_1.QUEUE_POLICIES.flashcard
        });
        this.highlightsQueue = new bullmq_1.Queue(contracts_1.QUEUE_NAMES.highlight, {
            ...redis,
            defaultJobOptions: contracts_1.QUEUE_POLICIES.highlight
        });
        this.summaryQueue = new bullmq_1.Queue(contracts_1.QUEUE_NAMES.summary, {
            ...redis,
            defaultJobOptions: contracts_1.QUEUE_POLICIES.summary
        });
    }
    async enqueueIngestion(payload) {
        const parsed = contracts_1.IngestionJobSchema.parse(payload);
        await this.ingestionQueue.add('ingestion-request', parsed);
    }
    async enqueueFlashcard(payload) {
        const parsed = contracts_1.FlashcardGenerationJobSchema.parse(payload);
        await this.flashcardQueue.add('generate', parsed);
    }
    async enqueueHighlights(payload) {
        const parsed = contracts_1.HighlightGenerationJobSchema.parse(payload);
        await this.highlightsQueue.add('generate', parsed);
    }
    async enqueueSummary(payload) {
        const parsed = contracts_1.SummaryGenerationJobSchema.parse(payload);
        await this.summaryQueue.add('generate', parsed);
    }
    async onModuleDestroy() {
        await this.ingestionQueue.close();
        await this.flashcardQueue.close();
        await this.highlightsQueue.close();
        await this.summaryQueue.close();
    }
};
exports.QueueService = QueueService;
exports.QueueService = QueueService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object])
], QueueService);
//# sourceMappingURL=queue.service.js.map
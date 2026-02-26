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
exports.JobStoreService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@lecture/config");
const pipeline_1 = require("@lecture/pipeline");
let JobStoreService = class JobStoreService {
    constructor(env) {
        if (!env.DATABASE_URL) {
            throw new Error('DATABASE_URL is required for api-gateway');
        }
        this.repo = pipeline_1.PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
    }
    async onModuleInit() {
        await this.repo.ensureSchema();
    }
    async onModuleDestroy() {
        await this.repo.close();
    }
};
exports.JobStoreService = JobStoreService;
exports.JobStoreService = JobStoreService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object])
], JobStoreService);
//# sourceMappingURL=job-store.service.js.map
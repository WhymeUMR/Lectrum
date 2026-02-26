import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { AppEnv } from '@lecture/config';
import { PipelineRepository } from '@lecture/pipeline';
export declare class JobStoreService implements OnModuleInit, OnModuleDestroy {
    readonly repo: PipelineRepository;
    constructor(env: AppEnv);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}

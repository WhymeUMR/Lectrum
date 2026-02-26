import { OnModuleDestroy } from '@nestjs/common';
import { AppEnv } from '@lecture/config';
export declare class QueueService implements OnModuleDestroy {
    private readonly env;
    private readonly ingestionQueue;
    constructor(env: AppEnv);
    enqueueIngestion(payload: unknown): Promise<void>;
    onModuleDestroy(): Promise<void>;
}

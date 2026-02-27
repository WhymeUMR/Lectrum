import { OnModuleDestroy } from '@nestjs/common';
import { AppEnv } from '@lecture/config';
export declare class QueueService implements OnModuleDestroy {
    private readonly env;
    private readonly ingestionQueue;
    private readonly flashcardQueue;
    private readonly highlightsQueue;
    private readonly summaryQueue;
    constructor(env: AppEnv);
    enqueueIngestion(payload: unknown): Promise<void>;
    enqueueFlashcard(payload: unknown): Promise<void>;
    enqueueHighlights(payload: unknown): Promise<void>;
    enqueueSummary(payload: unknown): Promise<void>;
    onModuleDestroy(): Promise<void>;
}

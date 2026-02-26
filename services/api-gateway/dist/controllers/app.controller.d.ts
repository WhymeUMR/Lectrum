import { AppEnv } from '@lecture/config';
import { QueueService } from '../services/queue.service';
import { JobStoreService } from '../services/job-store.service';
export declare class AppController {
    private readonly env;
    private readonly queueService;
    private readonly store;
    constructor(env: AppEnv, queueService: QueueService, store: JobStoreService);
    health(): {
        status: string;
        service: string;
        appEnv: "local" | "staging" | "production";
        queuePrefix: string;
        contractVersion: string;
    };
    ready(): {
        status: string;
        queues: {
            readonly ingestion: "lec.v1.ingestion";
            readonly transcription: "lec.v1.transcription";
            readonly flashcard: "lec.v1.flashcard";
        };
    };
    createIngestionJob(parsed: any): Promise<{
        jobId: `${string}-${string}-${string}-${string}-${string}`;
        lectureId: `${string}-${string}-${string}-${string}-${string}`;
        status: string;
        queue: "lec.v1.ingestion";
    }>;
    getJob(jobId: string): Promise<import("@lecture/pipeline").JobRecord>;
    getJobResult(jobId: string): Promise<{
        jobId: string;
        status: "QUEUED" | "INGESTING" | "INGESTED" | "TRANSCRIBING" | "FAILED";
        message: string;
        lectureId?: undefined;
        transcriptPath?: undefined;
        transcriptText?: undefined;
    } | {
        jobId: string;
        lectureId: string;
        transcriptPath: string | null;
        transcriptText: string | null;
        status?: undefined;
        message?: undefined;
    }>;
}

import { AppEnv } from '@lecture/config';
import { Response } from 'express';
import { QueueService } from '../services/queue.service';
import { JobStoreService } from '../services/job-store.service';
import { MaterialAssistantService } from '../services/material-assistant.service';
import { AssistantTtsService } from '../services/assistant-tts.service';
export declare class AppController {
    private readonly env;
    private readonly queueService;
    private readonly store;
    private readonly materialAssistant;
    private readonly assistantTts;
    constructor(env: AppEnv, queueService: QueueService, store: JobStoreService, materialAssistant: MaterialAssistantService, assistantTts: AssistantTtsService);
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
            readonly highlight: "lec.v1.highlight";
            readonly summary: "lec.v1.summary";
            readonly summaryFallback: "lec.v1.summary_fallback";
        };
    };
    createIngestionJob(parsed: any, file?: {
        buffer: Buffer;
    }): Promise<{
        jobId: `${string}-${string}-${string}-${string}-${string}`;
        lectureId: `${string}-${string}-${string}-${string}-${string}`;
        status: string;
        queue: "lec.v1.ingestion";
    }>;
    private assertSupportedUpload;
    private isAudioVideoJob;
    getJob(jobId: string): Promise<import("@lecture/pipeline").JobRecord>;
    getJobResult(jobId: string, response: Response): Promise<{
        jobId: string;
        status: "FAILED";
        message: string;
        errorCode: string | null;
        errorMessage: string | null;
        progress?: undefined;
        recommendedPollIntervalMs?: undefined;
        expectedMaxProcessingMs?: undefined;
        lectureId?: undefined;
        transcriptPath?: undefined;
        transcriptText?: undefined;
        transcript?: undefined;
        highlightsPath?: undefined;
        highlights?: undefined;
        summaryPath?: undefined;
        summary?: undefined;
        flashcardsPath?: undefined;
        flashcards?: undefined;
    } | {
        jobId: string;
        status: "QUEUED" | "INGESTING" | "INGESTED" | "TRANSCRIBING" | "GENERATING_HIGHLIGHTS" | "GENERATING_SUMMARY" | "GENERATING_FLASHCARDS";
        message: string;
        progress: number;
        recommendedPollIntervalMs: number;
        expectedMaxProcessingMs: number;
        errorCode?: undefined;
        errorMessage?: undefined;
        lectureId?: undefined;
        transcriptPath?: undefined;
        transcriptText?: undefined;
        transcript?: undefined;
        highlightsPath?: undefined;
        highlights?: undefined;
        summaryPath?: undefined;
        summary?: undefined;
        flashcardsPath?: undefined;
        flashcards?: undefined;
    } | {
        jobId: string;
        lectureId: string;
        status: "COMPLETED";
        transcriptPath: string | null;
        transcriptText: string | null;
        transcript: any;
        highlightsPath: string | null;
        highlights: any;
        summaryPath: string | null;
        summary: any;
        flashcardsPath: string | null;
        flashcards: any;
        message?: undefined;
        errorCode?: undefined;
        errorMessage?: undefined;
        progress?: undefined;
        recommendedPollIntervalMs?: undefined;
        expectedMaxProcessingMs?: undefined;
    }>;
    getFullTranscript(jobId: string, response: Response): Promise<{
        jobId: string;
        status: "FAILED";
        message: string;
        errorCode: string | null;
        errorMessage: string | null;
        lectureId?: undefined;
        transcript?: undefined;
    } | {
        jobId: string;
        status: "QUEUED" | "INGESTING" | "INGESTED" | "TRANSCRIBING" | "GENERATING_HIGHLIGHTS" | "GENERATING_SUMMARY" | "GENERATING_FLASHCARDS" | "COMPLETED";
        message: string;
        errorCode?: undefined;
        errorMessage?: undefined;
        lectureId?: undefined;
        transcript?: undefined;
    } | {
        jobId: string;
        lectureId: string;
        transcript: any;
        status?: undefined;
        message?: undefined;
        errorCode?: undefined;
        errorMessage?: undefined;
    }>;
    generateTranscriptHighlights(jobId: string, response: Response): Promise<{
        jobId: string;
        status: string;
    }>;
    getTranscriptHighlights(jobId: string, response: Response): Promise<{
        jobId: string;
        status: "FAILED";
        message: string;
        errorCode: string | null;
        errorMessage: string | null;
        lectureId?: undefined;
        highlights?: undefined;
    } | {
        jobId: string;
        status: "QUEUED" | "INGESTING" | "INGESTED" | "TRANSCRIBING" | "GENERATING_HIGHLIGHTS" | "GENERATING_SUMMARY" | "GENERATING_FLASHCARDS" | "COMPLETED";
        message: string;
        errorCode?: undefined;
        errorMessage?: undefined;
        lectureId?: undefined;
        highlights?: undefined;
    } | {
        jobId: string;
        lectureId: string;
        highlights: any;
        status?: undefined;
        message?: undefined;
        errorCode?: undefined;
        errorMessage?: undefined;
    }>;
    generateLectureSummary(jobId: string, response: Response): Promise<{
        jobId: string;
        status: string;
    }>;
    getLectureSummary(jobId: string, response: Response): Promise<{
        jobId: string;
        status: "FAILED";
        message: string;
        errorCode: string | null;
        errorMessage: string | null;
        lectureId?: undefined;
        summary?: undefined;
    } | {
        jobId: string;
        status: "QUEUED" | "INGESTING" | "INGESTED" | "TRANSCRIBING" | "GENERATING_HIGHLIGHTS" | "GENERATING_SUMMARY" | "GENERATING_FLASHCARDS" | "COMPLETED";
        message: string;
        errorCode?: undefined;
        errorMessage?: undefined;
        lectureId?: undefined;
        summary?: undefined;
    } | {
        jobId: string;
        lectureId: string;
        summary: any;
        status?: undefined;
        message?: undefined;
        errorCode?: undefined;
        errorMessage?: undefined;
    }>;
    askMaterialAssistant(body: {
        jobId: string;
        question: string;
        sessionId: string;
    }): Promise<{
        jobId: string;
        sessionId: string;
        answer: string;
        citations: import("../services/material-assistant.service").AssistantCitation[];
        webSources: import("../services/material-assistant.service").AssistantWebSource[];
        sources: {
            lecture: import("../services/material-assistant.service").AssistantCitation[];
            web: import("../services/material-assistant.service").AssistantWebSource[];
        };
        confidence: number;
        reason: "ok" | "web_fallback" | "no_context";
        refused: boolean;
    }>;
    generateAssistantRecapAudio(body: {
        jobId: string;
        sessionId: string;
        ttsModel?: string;
        ttsVoiceId?: string;
    }): Promise<{
        jobId: string;
        sessionId: string;
        recapText: string;
        audioBase64: string;
        audioMimeType: string;
        ttsModel: string;
        chunks: number;
    }>;
    generateAssistantRecapText(body: {
        jobId: string;
        sessionId: string;
    }): Promise<{
        jobId: string;
        sessionId: string;
        recapText: string;
    }>;
    streamAssistantRecapAudio(body: {
        jobId: string;
        sessionId: string;
        ttsModel?: string;
        ttsVoiceId?: string;
    }, response: Response): Promise<void>;
    generateFlashcards(jobId: string, body: {
        count: number;
    }, response: Response): Promise<{
        jobId: string;
        status: string;
        requestedCards: number;
    }>;
    generateFlashcardsByJobId(body: {
        jobId: string;
        count: number;
    }, response: Response): Promise<{
        jobId: string;
        status: string;
        requestedCards: number;
    }>;
    private requestFlashcardsGeneration;
    private generateRecapTextForSession;
    private requestHighlightsGeneration;
    private requestSummaryGeneration;
    private statusToProgress;
}

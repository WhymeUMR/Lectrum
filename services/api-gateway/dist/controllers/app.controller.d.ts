import { AppEnv } from '@lecture/config';
import { Response } from 'express';
import { QueueService } from '../services/queue.service';
import { JobStoreService } from '../services/job-store.service';
import { MaterialAssistantService } from '../services/material-assistant.service';
import { AssistantTtsService } from '../services/assistant-tts.service';
import { MaterialQuizService, QuizAnswerInput } from '../services/material-quiz.service';
import { AuthUser } from '../auth/auth.types';
export declare class AppController {
    private readonly env;
    private readonly queueService;
    private readonly store;
    private readonly materialAssistant;
    private readonly assistantTts;
    private readonly materialQuiz;
    private static readonly MAX_FILENAME_LENGTH;
    private static readonly FILE_SIGNATURE_MIN_BYTES;
    constructor(env: AppEnv, queueService: QueueService, store: JobStoreService, materialAssistant: MaterialAssistantService, assistantTts: AssistantTtsService, materialQuiz: MaterialQuizService);
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
    }, request?: {
        user?: AuthUser;
    }): Promise<{
        jobId: `${string}-${string}-${string}-${string}-${string}`;
        lectureId: `${string}-${string}-${string}-${string}-${string}`;
        status: string;
        queue: "lec.v1.ingestion";
    }>;
    createUrlIngestionJob(parsed: any, request?: {
        user?: AuthUser;
    }): Promise<{
        jobId: `${string}-${string}-${string}-${string}-${string}`;
        lectureId: `${string}-${string}-${string}-${string}-${string}`;
        status: string;
        queue: "lec.v1.ingestion";
    }>;
    createVideoIngestionJob(parsed: any, request?: {
        user?: AuthUser;
    }): Promise<{
        jobId: `${string}-${string}-${string}-${string}-${string}`;
        lectureId: `${string}-${string}-${string}-${string}-${string}`;
        status: string;
        queue: "lec.v1.ingestion";
    }>;
    private createIngestionJobInternal;
    private filenameFromUrl;
    private assertSupportedUpload;
    private normalizeBase64;
    private decodeStrictBase64;
    private maxBase64Length;
    private isAudioVideoJob;
    getJob(jobId: string, request?: {
        user?: AuthUser;
    }): Promise<import("@lecture/pipeline").JobRecord>;
    listUserJobs(limitRaw?: string, request?: {
        user?: AuthUser;
    }): Promise<{
        items: import("@lecture/pipeline").JobRecord[];
        count: number;
        limit: number;
    }>;
    getJobResult(jobId: string, response: Response, request?: {
        user?: AuthUser;
    }): Promise<{
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
        quiz?: undefined;
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
        quiz?: undefined;
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
        quiz: import("../services/material-quiz.service").PublicQuiz | null;
        message?: undefined;
        errorCode?: undefined;
        errorMessage?: undefined;
        progress?: undefined;
        recommendedPollIntervalMs?: undefined;
        expectedMaxProcessingMs?: undefined;
    }>;
    getFullTranscript(jobId: string, response: Response, request?: {
        user?: AuthUser;
    }): Promise<{
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
    generateTranscriptHighlights(jobId: string, response: Response, request?: {
        user?: AuthUser;
    }): Promise<{
        jobId: string;
        status: string;
    }>;
    getTranscriptHighlights(jobId: string, response: Response, request?: {
        user?: AuthUser;
    }): Promise<{
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
    generateLectureSummary(jobId: string, response: Response, request?: {
        user?: AuthUser;
    }): Promise<{
        jobId: string;
        status: string;
    }>;
    getLectureSummary(jobId: string, response: Response, request?: {
        user?: AuthUser;
    }): Promise<{
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
    }, request?: {
        user?: AuthUser;
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
    }, request?: {
        user?: AuthUser;
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
    }, request?: {
        user?: AuthUser;
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
    }, response: Response, request?: {
        user?: AuthUser;
    }): Promise<void>;
    listAssistantTtsVoices(): Promise<{
        voices: import("../services/assistant-tts.service").AssistantTtsVoice[];
        defaultVoiceId: string;
        ttsModel: string;
    }>;
    streamAssistantTtsPreview(body: {
        ttsVoiceId: string;
        ttsModel?: string;
        text?: string;
    }, response: Response): Promise<void>;
    generateAssistantRecapAudioKaraoke(body: {
        jobId: string;
        sessionId: string;
        ttsModel?: string;
        ttsVoiceId?: string;
    }, request?: {
        user?: AuthUser;
    }): Promise<{
        jobId: string;
        sessionId: string;
        recapText: string;
        audioBase64: string;
        audioMimeType: string;
        ttsModel: string;
        chunks: number;
        words: import("../services/assistant-tts.service").AssistantTtsWordTiming[];
    }>;
    generateFlashcards(jobId: string, body: {
        count: number;
    }, response: Response, request?: {
        user?: AuthUser;
    }): Promise<{
        jobId: string;
        status: string;
        requestedCards: number;
    }>;
    generateFlashcardsByJobId(body: {
        jobId: string;
        count: number;
    }, response: Response, request?: {
        user?: AuthUser;
    }): Promise<{
        jobId: string;
        status: string;
        requestedCards: number;
    }>;
    generateMaterialQuiz(body: {
        jobId: string;
        count: number;
        difficulty: 'easy' | 'medium' | 'hard';
        language: string;
    }, request?: {
        user?: AuthUser;
    }): Promise<{
        jobId: string;
        quiz: import("../services/material-quiz.service").PublicQuiz;
    }>;
    checkMaterialQuiz(body: {
        jobId: string;
        answers: QuizAnswerInput[];
    }, request?: {
        user?: AuthUser;
    }): Promise<{
        jobId: string;
        score: {
            total: number;
            correct: number;
            percentage: number;
        };
        results: {
            questionId: string;
            correct: boolean;
            explanation: string;
            expectedAnswer: string;
            userAnswer: string;
        }[];
    }>;
    getMaterialQuizStats(body: {
        jobId: string;
        answers: QuizAnswerInput[];
    }, request?: {
        user?: AuthUser;
    }): Promise<{
        jobId: string;
        score: {
            total: number;
            correct: number;
            percentage: number;
        };
        answered: number;
        wrongCount: number;
        needsWork: {
            questionId: string;
            topic: string;
            recommendation: string;
        }[];
        results: {
            questionId: string;
            correct: boolean;
            explanation: string;
            expectedAnswer: string;
            userAnswer: string;
        }[];
    }>;
    private requestFlashcardsGeneration;
    private generateRecapTextForSession;
    private requestHighlightsGeneration;
    private requestSummaryGeneration;
    private statusToProgress;
    private safePublicQuiz;
    private getCurrentUser;
    private getOwnedJobOrThrow;
}

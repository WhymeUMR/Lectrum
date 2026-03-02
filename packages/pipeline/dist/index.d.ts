import { Pool } from 'pg';
export type JobStatus = 'QUEUED' | 'INGESTING' | 'INGESTED' | 'TRANSCRIBING' | 'GENERATING_HIGHLIGHTS' | 'GENERATING_SUMMARY' | 'GENERATING_FLASHCARDS' | 'COMPLETED' | 'FAILED';
export type SourceType = 'upload' | 'url';
export type AssistantMessageRole = 'user' | 'assistant';
export interface AssistantSessionMessage {
    role: AssistantMessageRole;
    content: string;
    createdAt: string;
}
export interface CreateJobInput {
    jobId: string;
    lectureId: string;
    ownerUserId: string;
    sourceType: SourceType;
    filename: string;
    mimeType?: string;
    sourceUrl?: string;
    requestedLanguage: string;
}
export interface JobRecord {
    jobId: string;
    lectureId: string;
    ownerUserId: string | null;
    status: JobStatus;
    sourceType: SourceType;
    filename: string;
    mimeType: string | null;
    sourceUrl: string | null;
    storagePath: string | null;
    transcriptPath: string | null;
    transcriptText: string | null;
    transcriptJson: string | null;
    highlightsPath: string | null;
    highlightsJson: string | null;
    flashcardsPath: string | null;
    flashcardsJson: string | null;
    summaryPath: string | null;
    summaryJson: string | null;
    quizJson: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    requestedLanguage: string;
    createdAt: string;
    updatedAt: string;
}
export interface RefreshSessionRecord {
    jti: string;
    userSub: string;
    login: string;
    role: 'admin' | 'user';
    expiresAt: string;
    revokedAt: string | null;
    createdAt: string;
}
export interface AuthUserRecord {
    userId: string;
    login: string;
    passwordHash: string;
    provider: 'local' | 'google' | 'telegram' | null;
    providerUserId: string | null;
    role: 'admin' | 'user';
    createdAt: string;
    updatedAt: string;
}
export interface AuthUserStateRecord {
    userSub: string;
    lastJobId: string | null;
    assistantSessionId: string | null;
    updatedAt: string;
}
export declare class ActiveJobExistsError extends Error {
    constructor(message: string);
}
export declare class PipelineRepository {
    private readonly pool;
    constructor(pool: Pool);
    static fromDatabaseUrl(databaseUrl: string): PipelineRepository;
    ensureSchema(): Promise<void>;
    close(): Promise<void>;
    createJob(input: CreateJobInput): Promise<void>;
    getActiveJob(): Promise<Pick<JobRecord, 'jobId' | 'status' | 'lectureId'> | null>;
    getActiveJobForUser(ownerUserId: string): Promise<Pick<JobRecord, 'jobId' | 'status' | 'lectureId'> | null>;
    updateStatus(jobId: string, status: JobStatus): Promise<void>;
    setSourceStoragePath(jobId: string, storagePath: string): Promise<void>;
    saveTranscript(jobId: string, transcriptPath: string, transcriptText: string): Promise<void>;
    saveTranscriptResult(jobId: string, transcriptPath: string, transcriptText: string, transcriptJson: string | null): Promise<void>;
    setError(jobId: string, code: string, message: string): Promise<void>;
    appendAssistantMessage(jobId: string, sessionId: string, role: AssistantMessageRole, content: string): Promise<void>;
    getAssistantHistory(jobId: string, sessionId: string, limit?: number): Promise<AssistantSessionMessage[]>;
    trimAssistantHistory(jobId: string, sessionId: string, maxMessages?: number): Promise<void>;
    saveFlashcards(jobId: string, flashcardsPath: string, flashcardsJson: string): Promise<void>;
    saveSummary(jobId: string, summaryPath: string, summaryJson: string): Promise<void>;
    saveHighlights(jobId: string, highlightsPath: string, highlightsJson: string): Promise<void>;
    saveQuiz(jobId: string, quizJson: string): Promise<void>;
    getJob(jobId: string): Promise<JobRecord | null>;
    listJobsForUser(ownerUserId: string, limit?: number): Promise<JobRecord[]>;
    createRefreshSession(input: {
        jti: string;
        userSub: string;
        login: string;
        role: 'admin' | 'user';
        expiresAt: string;
    }): Promise<void>;
    getRefreshSession(jti: string): Promise<RefreshSessionRecord | null>;
    revokeRefreshSession(jti: string): Promise<void>;
    deleteExpiredRefreshSessions(): Promise<void>;
    createAuthUser(input: {
        userId: string;
        login: string;
        passwordHash: string;
        provider?: 'local' | 'google' | 'telegram' | null;
        providerUserId?: string | null;
        role: 'admin' | 'user';
    }): Promise<void>;
    getAuthUserByLogin(login: string): Promise<AuthUserRecord | null>;
    getAuthUserByProvider(provider: 'google' | 'telegram', providerUserId: string): Promise<AuthUserRecord | null>;
    getAuthUserState(userSub: string): Promise<AuthUserStateRecord | null>;
    upsertAuthUserState(input: {
        userSub: string;
        lastJobId: string | null;
        assistantSessionId: string | null;
    }): Promise<void>;
}
export declare function writeArtifact(artifactsRoot: string, relativePath: string, content: Buffer | string): Promise<string>;
export declare function decodeBase64Payload(payload: string): Buffer;

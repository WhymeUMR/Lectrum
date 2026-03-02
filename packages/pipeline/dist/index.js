"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineRepository = exports.ActiveJobExistsError = void 0;
exports.writeArtifact = writeArtifact;
exports.decodeBase64Payload = decodeBase64Payload;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const pg_1 = require("pg");
class ActiveJobExistsError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ActiveJobExistsError';
    }
}
exports.ActiveJobExistsError = ActiveJobExistsError;
async function ensurePipelineSchema(pool) {
    // Serialize schema initialization across concurrent service startups.
    await pool.query(`SELECT pg_advisory_lock(918273645)`);
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS lecture_jobs (
        job_id TEXT PRIMARY KEY,
        lecture_id TEXT NOT NULL,
        owner_user_id TEXT,
        status TEXT NOT NULL,
        source_type TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT,
        source_url TEXT,
        storage_path TEXT,
        transcript_path TEXT,
        transcript_text TEXT,
        transcript_json TEXT,
        highlights_path TEXT,
        highlights_json TEXT,
        flashcards_path TEXT,
        flashcards_json TEXT,
        summary_path TEXT,
        summary_json TEXT,
        quiz_json TEXT,
        error_code TEXT,
        error_message TEXT,
        requested_language TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_lecture_jobs_lecture_id ON lecture_jobs(lecture_id);
      CREATE INDEX IF NOT EXISTS idx_lecture_jobs_owner_user_id ON lecture_jobs(owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_lecture_jobs_status ON lecture_jobs(status);
      DROP INDEX IF EXISTS uq_single_active_job;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_single_active_job_per_user
      ON lecture_jobs (owner_user_id)
      WHERE owner_user_id IS NOT NULL
        AND status IN ('QUEUED', 'INGESTING', 'INGESTED', 'TRANSCRIBING');
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS assistant_session_messages (
        id BIGSERIAL PRIMARY KEY,
        job_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (role IN ('user', 'assistant'))
      );

      CREATE INDEX IF NOT EXISTS idx_assistant_session_messages_lookup
      ON assistant_session_messages(job_id, session_id, id DESC);
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        user_id TEXT PRIMARY KEY,
        login TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        provider TEXT,
        provider_user_id TEXT,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (role IN ('admin', 'user')),
        CHECK (provider IS NULL OR provider IN ('local', 'google', 'telegram'))
      );

      CREATE INDEX IF NOT EXISTS idx_auth_users_login
      ON auth_users(login);

      CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_users_provider_identity
      ON auth_users(provider, provider_user_id)
      WHERE provider IS NOT NULL AND provider_user_id IS NOT NULL;
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_user_state (
        user_sub TEXT PRIMARY KEY,
        last_job_id TEXT,
        assistant_session_id TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
        await pool.query(`
      ALTER TABLE auth_users
      ADD COLUMN IF NOT EXISTS provider TEXT;

      ALTER TABLE auth_users
      ADD COLUMN IF NOT EXISTS provider_user_id TEXT;
    `);
        await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'auth_users'
            AND column_name = 'provider'
        ) THEN
          UPDATE auth_users
          SET provider = 'local'
          WHERE provider IS NULL;
        END IF;
      END$$;
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
        jti TEXT PRIMARY KEY,
        user_sub TEXT NOT NULL,
        login TEXT NOT NULL,
        role TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (role IN ('admin', 'user'))
      );

      CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_expires_at
      ON auth_refresh_sessions(expires_at);

      CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_user_sub
      ON auth_refresh_sessions(user_sub);
    `);
        await pool.query(`
      ALTER TABLE lecture_jobs
      ADD COLUMN IF NOT EXISTS owner_user_id TEXT;

      ALTER TABLE lecture_jobs
      ADD COLUMN IF NOT EXISTS flashcards_path TEXT;

      ALTER TABLE lecture_jobs
      ADD COLUMN IF NOT EXISTS flashcards_json TEXT;

      ALTER TABLE lecture_jobs
      ADD COLUMN IF NOT EXISTS transcript_json TEXT;

      ALTER TABLE lecture_jobs
      ADD COLUMN IF NOT EXISTS highlights_path TEXT;

      ALTER TABLE lecture_jobs
      ADD COLUMN IF NOT EXISTS highlights_json TEXT;

      ALTER TABLE lecture_jobs
      ADD COLUMN IF NOT EXISTS summary_path TEXT;

      ALTER TABLE lecture_jobs
      ADD COLUMN IF NOT EXISTS summary_json TEXT;

      ALTER TABLE lecture_jobs
      ADD COLUMN IF NOT EXISTS quiz_json TEXT;
    `);
    }
    finally {
        await pool.query(`SELECT pg_advisory_unlock(918273645)`);
    }
}
class PipelineRepository {
    constructor(pool) {
        this.pool = pool;
    }
    static fromDatabaseUrl(databaseUrl) {
        return new PipelineRepository(new pg_1.Pool({ connectionString: databaseUrl }));
    }
    async ensureSchema() {
        await ensurePipelineSchema(this.pool);
    }
    async close() {
        await this.pool.end();
    }
    async createJob(input) {
        try {
            await this.pool.query(`
        INSERT INTO lecture_jobs (
          job_id, lecture_id, owner_user_id, status, source_type, filename, mime_type, source_url, requested_language
        ) VALUES ($1, $2, $3, 'QUEUED', $4, $5, $6, $7, $8)
        `, [
                input.jobId,
                input.lectureId,
                input.ownerUserId,
                input.sourceType,
                input.filename,
                input.mimeType ?? null,
                input.sourceUrl ?? null,
                input.requestedLanguage
            ]);
        }
        catch (error) {
            const err = error;
            if (err.code === '23505' && err.constraint === 'uq_single_active_job_per_user') {
                throw new ActiveJobExistsError('Another lecture is already being processed');
            }
            throw error;
        }
    }
    async getActiveJob() {
        const result = await this.pool.query(`
      SELECT
        job_id AS "jobId",
        status,
        lecture_id AS "lectureId"
      FROM lecture_jobs
      WHERE status IN ('QUEUED', 'INGESTING', 'INGESTED', 'TRANSCRIBING')
      ORDER BY created_at ASC
      LIMIT 1
      `);
        return result.rows[0] ?? null;
    }
    async getActiveJobForUser(ownerUserId) {
        const result = await this.pool.query(`
      SELECT
        job_id AS "jobId",
        status,
        lecture_id AS "lectureId"
      FROM lecture_jobs
      WHERE owner_user_id = $1
        AND status IN ('QUEUED', 'INGESTING', 'INGESTED', 'TRANSCRIBING')
      ORDER BY created_at ASC
      LIMIT 1
      `, [ownerUserId]);
        return result.rows[0] ?? null;
    }
    async updateStatus(jobId, status) {
        await this.pool.query(`
      UPDATE lecture_jobs
      SET status = $2,
          error_code = CASE WHEN $2 = 'FAILED' THEN error_code ELSE NULL END,
          error_message = CASE WHEN $2 = 'FAILED' THEN error_message ELSE NULL END,
          updated_at = NOW()
      WHERE job_id = $1
      `, [jobId, status]);
    }
    async setSourceStoragePath(jobId, storagePath) {
        await this.pool.query(`UPDATE lecture_jobs SET storage_path = $2, updated_at = NOW() WHERE job_id = $1`, [jobId, storagePath]);
    }
    async saveTranscript(jobId, transcriptPath, transcriptText) {
        await this.saveTranscriptResult(jobId, transcriptPath, transcriptText, null);
    }
    async saveTranscriptResult(jobId, transcriptPath, transcriptText, transcriptJson) {
        await this.pool.query(`
      UPDATE lecture_jobs
      SET transcript_path = $2,
          transcript_text = $3,
          transcript_json = $4,
          updated_at = NOW()
      WHERE job_id = $1
      `, [jobId, transcriptPath, transcriptText, transcriptJson]);
    }
    async setError(jobId, code, message) {
        await this.pool.query(`
      UPDATE lecture_jobs
      SET status = 'FAILED', error_code = $2, error_message = $3, updated_at = NOW()
      WHERE job_id = $1
      `, [jobId, code, message]);
    }
    async appendAssistantMessage(jobId, sessionId, role, content) {
        await this.pool.query(`
      INSERT INTO assistant_session_messages (job_id, session_id, role, content)
      VALUES ($1, $2, $3, $4)
      `, [jobId, sessionId, role, content]);
    }
    async getAssistantHistory(jobId, sessionId, limit = 12) {
        const safeLimit = Math.max(1, Math.min(40, Math.floor(limit)));
        const result = await this.pool.query(`
      SELECT role, content, created_at AS "createdAt"
      FROM assistant_session_messages
      WHERE job_id = $1 AND session_id = $2
      ORDER BY id DESC
      LIMIT $3
      `, [jobId, sessionId, safeLimit]);
        return result.rows.reverse();
    }
    async trimAssistantHistory(jobId, sessionId, maxMessages = 16) {
        const safeMax = Math.max(2, Math.min(100, Math.floor(maxMessages)));
        await this.pool.query(`
      DELETE FROM assistant_session_messages
      WHERE job_id = $1
        AND session_id = $2
        AND id NOT IN (
          SELECT id
          FROM assistant_session_messages
          WHERE job_id = $1 AND session_id = $2
          ORDER BY id DESC
          LIMIT $3
        )
      `, [jobId, sessionId, safeMax]);
    }
    async saveFlashcards(jobId, flashcardsPath, flashcardsJson) {
        await this.pool.query(`
      UPDATE lecture_jobs
      SET flashcards_path = $2,
          flashcards_json = $3,
          updated_at = NOW()
      WHERE job_id = $1
      `, [jobId, flashcardsPath, flashcardsJson]);
    }
    async saveSummary(jobId, summaryPath, summaryJson) {
        await this.pool.query(`
      UPDATE lecture_jobs
      SET summary_path = $2,
          summary_json = $3,
          updated_at = NOW()
      WHERE job_id = $1
      `, [jobId, summaryPath, summaryJson]);
    }
    async saveHighlights(jobId, highlightsPath, highlightsJson) {
        await this.pool.query(`
      UPDATE lecture_jobs
      SET highlights_path = $2,
          highlights_json = $3,
          updated_at = NOW()
      WHERE job_id = $1
      `, [jobId, highlightsPath, highlightsJson]);
    }
    async saveQuiz(jobId, quizJson) {
        await this.pool.query(`
      UPDATE lecture_jobs
      SET quiz_json = $2,
          updated_at = NOW()
      WHERE job_id = $1
      `, [jobId, quizJson]);
    }
    async getJob(jobId) {
        const result = await this.pool.query(`
      SELECT
        job_id AS "jobId",
        lecture_id AS "lectureId",
        owner_user_id AS "ownerUserId",
        status,
        source_type AS "sourceType",
        filename,
        mime_type AS "mimeType",
        source_url AS "sourceUrl",
        storage_path AS "storagePath",
        transcript_path AS "transcriptPath",
        transcript_text AS "transcriptText",
        transcript_json AS "transcriptJson",
        highlights_path AS "highlightsPath",
        highlights_json AS "highlightsJson",
        flashcards_path AS "flashcardsPath",
        flashcards_json AS "flashcardsJson",
        summary_path AS "summaryPath",
        summary_json AS "summaryJson",
        quiz_json AS "quizJson",
        error_code AS "errorCode",
        error_message AS "errorMessage",
        requested_language AS "requestedLanguage",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM lecture_jobs
      WHERE job_id = $1
      `, [jobId]);
        return result.rows[0] ?? null;
    }
    async listJobsForUser(ownerUserId, limit = 20) {
        const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
        const result = await this.pool.query(`
      SELECT
        job_id AS "jobId",
        lecture_id AS "lectureId",
        owner_user_id AS "ownerUserId",
        status,
        source_type AS "sourceType",
        filename,
        mime_type AS "mimeType",
        source_url AS "sourceUrl",
        storage_path AS "storagePath",
        transcript_path AS "transcriptPath",
        transcript_text AS "transcriptText",
        transcript_json AS "transcriptJson",
        highlights_path AS "highlightsPath",
        highlights_json AS "highlightsJson",
        flashcards_path AS "flashcardsPath",
        flashcards_json AS "flashcardsJson",
        summary_path AS "summaryPath",
        summary_json AS "summaryJson",
        quiz_json AS "quizJson",
        error_code AS "errorCode",
        error_message AS "errorMessage",
        requested_language AS "requestedLanguage",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM lecture_jobs
      WHERE owner_user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `, [ownerUserId, safeLimit]);
        return result.rows;
    }
    async createRefreshSession(input) {
        await this.pool.query(`
      INSERT INTO auth_refresh_sessions (
        jti, user_sub, login, role, expires_at
      ) VALUES ($1, $2, $3, $4, $5)
      `, [input.jti, input.userSub, input.login, input.role, input.expiresAt]);
    }
    async getRefreshSession(jti) {
        const result = await this.pool.query(`
      SELECT
        jti,
        user_sub AS "userSub",
        login,
        role,
        expires_at AS "expiresAt",
        revoked_at AS "revokedAt",
        created_at AS "createdAt"
      FROM auth_refresh_sessions
      WHERE jti = $1
      LIMIT 1
      `, [jti]);
        return result.rows[0] ?? null;
    }
    async revokeRefreshSession(jti) {
        await this.pool.query(`
      UPDATE auth_refresh_sessions
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE jti = $1
      `, [jti]);
    }
    async deleteExpiredRefreshSessions() {
        await this.pool.query(`
      DELETE FROM auth_refresh_sessions
      WHERE expires_at <= NOW()
      `, []);
    }
    async createAuthUser(input) {
        await this.pool.query(`
      INSERT INTO auth_users (
        user_id, login, password_hash, provider, provider_user_id, role
      ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
            input.userId,
            input.login,
            input.passwordHash,
            input.provider ?? 'local',
            input.providerUserId ?? null,
            input.role
        ]);
    }
    async getAuthUserByLogin(login) {
        const result = await this.pool.query(`
      SELECT
        user_id AS "userId",
        login,
        password_hash AS "passwordHash",
        provider,
        provider_user_id AS "providerUserId",
        role,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM auth_users
      WHERE login = $1
      LIMIT 1
      `, [String(login || '').trim().toLowerCase()]);
        return result.rows[0] ?? null;
    }
    async getAuthUserByProvider(provider, providerUserId) {
        const result = await this.pool.query(`
      SELECT
        user_id AS "userId",
        login,
        password_hash AS "passwordHash",
        provider,
        provider_user_id AS "providerUserId",
        role,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM auth_users
      WHERE provider = $1 AND provider_user_id = $2
      LIMIT 1
      `, [provider, providerUserId]);
        return result.rows[0] ?? null;
    }
    async getAuthUserState(userSub) {
        const result = await this.pool.query(`
      SELECT
        user_sub AS "userSub",
        last_job_id AS "lastJobId",
        assistant_session_id AS "assistantSessionId",
        updated_at AS "updatedAt"
      FROM auth_user_state
      WHERE user_sub = $1
      LIMIT 1
      `, [userSub]);
        return result.rows[0] ?? null;
    }
    async upsertAuthUserState(input) {
        await this.pool.query(`
      INSERT INTO auth_user_state (
        user_sub, last_job_id, assistant_session_id, updated_at
      ) VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_sub)
      DO UPDATE SET
        last_job_id = EXCLUDED.last_job_id,
        assistant_session_id = EXCLUDED.assistant_session_id,
        updated_at = NOW()
      `, [input.userSub, input.lastJobId, input.assistantSessionId]);
    }
}
exports.PipelineRepository = PipelineRepository;
async function writeArtifact(artifactsRoot, relativePath, content) {
    const absolutePath = node_path_1.default.join(artifactsRoot, relativePath);
    await (0, promises_1.mkdir)(node_path_1.default.dirname(absolutePath), { recursive: true });
    await (0, promises_1.writeFile)(absolutePath, content);
    return absolutePath;
}
function decodeBase64Payload(payload) {
    return Buffer.from(payload, 'base64');
}
//# sourceMappingURL=index.js.map
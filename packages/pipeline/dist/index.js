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
        error_code TEXT,
        error_message TEXT,
        requested_language TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_lecture_jobs_lecture_id ON lecture_jobs(lecture_id);
      CREATE INDEX IF NOT EXISTS idx_lecture_jobs_status ON lecture_jobs(status);
      DROP INDEX IF EXISTS uq_single_active_job;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_single_active_job
      ON lecture_jobs ((1))
      WHERE status IN ('QUEUED', 'INGESTING', 'INGESTED', 'TRANSCRIBING');
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
          job_id, lecture_id, status, source_type, filename, mime_type, source_url, requested_language
        ) VALUES ($1, $2, 'QUEUED', $3, $4, $5, $6, $7)
        `, [
                input.jobId,
                input.lectureId,
                input.sourceType,
                input.filename,
                input.mimeType ?? null,
                input.sourceUrl ?? null,
                input.requestedLanguage
            ]);
        }
        catch (error) {
            const err = error;
            if (err.code === '23505' && err.constraint === 'uq_single_active_job') {
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
    async getJob(jobId) {
        const result = await this.pool.query(`
      SELECT
        job_id AS "jobId",
        lecture_id AS "lectureId",
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
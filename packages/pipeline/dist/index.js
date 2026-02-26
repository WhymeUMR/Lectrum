"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineRepository = void 0;
exports.writeArtifact = writeArtifact;
exports.decodeBase64Payload = decodeBase64Payload;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const pg_1 = require("pg");
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
        error_code TEXT,
        error_message TEXT,
        requested_language TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_lecture_jobs_lecture_id ON lecture_jobs(lecture_id);
      CREATE INDEX IF NOT EXISTS idx_lecture_jobs_status ON lecture_jobs(status);
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
    async updateStatus(jobId, status) {
        await this.pool.query(`UPDATE lecture_jobs SET status = $2, updated_at = NOW() WHERE job_id = $1`, [jobId, status]);
    }
    async setSourceStoragePath(jobId, storagePath) {
        await this.pool.query(`UPDATE lecture_jobs SET storage_path = $2, updated_at = NOW() WHERE job_id = $1`, [jobId, storagePath]);
    }
    async saveTranscript(jobId, transcriptPath, transcriptText) {
        await this.pool.query(`
      UPDATE lecture_jobs
      SET transcript_path = $2,
          transcript_text = $3,
          updated_at = NOW()
      WHERE job_id = $1
      `, [jobId, transcriptPath, transcriptText]);
    }
    async setError(jobId, code, message) {
        await this.pool.query(`
      UPDATE lecture_jobs
      SET status = 'FAILED', error_code = $2, error_message = $3, updated_at = NOW()
      WHERE job_id = $1
      `, [jobId, code, message]);
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
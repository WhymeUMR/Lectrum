import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

export type JobStatus =
  | 'QUEUED'
  | 'INGESTING'
  | 'INGESTED'
  | 'TRANSCRIBING'
  | 'GENERATING_FLASHCARDS'
  | 'COMPLETED'
  | 'FAILED';

export type SourceType = 'upload' | 'url';

export interface CreateJobInput {
  jobId: string;
  lectureId: string;
  sourceType: SourceType;
  filename: string;
  mimeType?: string;
  sourceUrl?: string;
  requestedLanguage: string;
}

export interface JobRecord {
  jobId: string;
  lectureId: string;
  status: JobStatus;
  sourceType: SourceType;
  filename: string;
  mimeType: string | null;
  sourceUrl: string | null;
  storagePath: string | null;
  transcriptPath: string | null;
  transcriptText: string | null;
  flashcardsPath: string | null;
  flashcardsJson: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  requestedLanguage: string;
  createdAt: string;
  updatedAt: string;
}

export class ActiveJobExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActiveJobExistsError';
  }
}

async function ensurePipelineSchema(pool: Pool): Promise<void> {
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
        flashcards_path TEXT,
        flashcards_json TEXT,
        error_code TEXT,
        error_message TEXT,
        requested_language TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_lecture_jobs_lecture_id ON lecture_jobs(lecture_id);
      CREATE INDEX IF NOT EXISTS idx_lecture_jobs_status ON lecture_jobs(status);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_single_active_job
      ON lecture_jobs ((1))
      WHERE status NOT IN ('COMPLETED', 'FAILED');
    `);
    await pool.query(`
      ALTER TABLE lecture_jobs
      ADD COLUMN IF NOT EXISTS flashcards_path TEXT;

      ALTER TABLE lecture_jobs
      ADD COLUMN IF NOT EXISTS flashcards_json TEXT;
    `);
  } finally {
    await pool.query(`SELECT pg_advisory_unlock(918273645)`);
  }
}

export class PipelineRepository {
  constructor(private readonly pool: Pool) {}

  static fromDatabaseUrl(databaseUrl: string): PipelineRepository {
    return new PipelineRepository(new Pool({ connectionString: databaseUrl }));
  }

  async ensureSchema(): Promise<void> {
    await ensurePipelineSchema(this.pool);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createJob(input: CreateJobInput): Promise<void> {
    try {
      await this.pool.query(
        `
        INSERT INTO lecture_jobs (
          job_id, lecture_id, status, source_type, filename, mime_type, source_url, requested_language
        ) VALUES ($1, $2, 'QUEUED', $3, $4, $5, $6, $7)
        `,
        [
          input.jobId,
          input.lectureId,
          input.sourceType,
          input.filename,
          input.mimeType ?? null,
          input.sourceUrl ?? null,
          input.requestedLanguage
        ]
      );
    } catch (error) {
      const err = error as { code?: string; constraint?: string };
      if (err.code === '23505' && err.constraint === 'uq_single_active_job') {
        throw new ActiveJobExistsError('Another lecture is already being processed');
      }
      throw error;
    }
  }

  async getActiveJob(): Promise<Pick<JobRecord, 'jobId' | 'status' | 'lectureId'> | null> {
    const result = await this.pool.query(
      `
      SELECT
        job_id AS "jobId",
        status,
        lecture_id AS "lectureId"
      FROM lecture_jobs
      WHERE status NOT IN ('COMPLETED', 'FAILED')
      ORDER BY created_at ASC
      LIMIT 1
      `
    );

    return (result.rows[0] as Pick<JobRecord, 'jobId' | 'status' | 'lectureId'> | undefined) ?? null;
  }

  async updateStatus(jobId: string, status: JobStatus): Promise<void> {
    await this.pool.query(
      `UPDATE lecture_jobs SET status = $2, updated_at = NOW() WHERE job_id = $1`,
      [jobId, status]
    );
  }

  async setSourceStoragePath(jobId: string, storagePath: string): Promise<void> {
    await this.pool.query(
      `UPDATE lecture_jobs SET storage_path = $2, updated_at = NOW() WHERE job_id = $1`,
      [jobId, storagePath]
    );
  }

  async saveTranscript(
    jobId: string,
    transcriptPath: string,
    transcriptText: string
  ): Promise<void> {
    await this.pool.query(
      `
      UPDATE lecture_jobs
      SET transcript_path = $2,
          transcript_text = $3,
          updated_at = NOW()
      WHERE job_id = $1
      `,
      [jobId, transcriptPath, transcriptText]
    );
  }

  async setError(jobId: string, code: string, message: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE lecture_jobs
      SET status = 'FAILED', error_code = $2, error_message = $3, updated_at = NOW()
      WHERE job_id = $1
      `,
      [jobId, code, message]
    );
  }

  async saveFlashcards(jobId: string, flashcardsPath: string, flashcardsJson: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE lecture_jobs
      SET flashcards_path = $2,
          flashcards_json = $3,
          updated_at = NOW()
      WHERE job_id = $1
      `,
      [jobId, flashcardsPath, flashcardsJson]
    );
  }

  async getJob(jobId: string): Promise<JobRecord | null> {
    const result = await this.pool.query(
      `
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
        flashcards_path AS "flashcardsPath",
        flashcards_json AS "flashcardsJson",
        error_code AS "errorCode",
        error_message AS "errorMessage",
        requested_language AS "requestedLanguage",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM lecture_jobs
      WHERE job_id = $1
      `,
      [jobId]
    );

    return (result.rows[0] as JobRecord | undefined) ?? null;
  }
}

export async function writeArtifact(
  artifactsRoot: string,
  relativePath: string,
  content: Buffer | string
): Promise<string> {
  const absolutePath = path.join(artifactsRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
  return absolutePath;
}

export function decodeBase64Payload(payload: string): Buffer {
  return Buffer.from(payload, 'base64');
}

import 'reflect-metadata';
import path from 'node:path';
import { Controller, Get, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Job, Queue, Worker } from 'bullmq';
import { IngestionJobPayload, QUEUE_NAMES, QUEUE_POLICIES } from '@lecture/contracts';
import { APP_ENV, AppEnv, SharedConfigModule, buildRedisConnection } from '@lecture/config';
import { PipelineRepository, decodeBase64Payload, writeArtifact } from '@lecture/pipeline';

interface ParsedUrlResponse {
  text: string;
  sourceUrl: string;
  language: string;
}

interface DownloadedVideoResponse {
  lectureId: string;
  sourceUrl: string;
  storagePath: string;
  filename: string;
  mimeType: string;
}

class UrlParsingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlParsingError';
  }
}

class VideoDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoDownloadError';
  }
}

async function parseUrlSource(
  serviceUrl: string,
  sourceUrl: string,
  language: string,
  timeoutMs: number
): Promise<ParsedUrlResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${serviceUrl.replace(/\/+$/, '')}/api/v1/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: sourceUrl, language }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new UrlParsingError(
        `url-parser-service returned ${response.status}: ${body || response.statusText}`
      );
    }

    const payload = (await response.json()) as Partial<ParsedUrlResponse>;
    const text = String(payload.text ?? '').trim();
    if (!text) {
      throw new UrlParsingError('url-parser-service returned empty text');
    }
    return {
      text,
      sourceUrl: String(payload.sourceUrl ?? sourceUrl),
      language: String(payload.language ?? language)
    };
  } catch (error) {
    if (error instanceof UrlParsingError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new UrlParsingError(`url-parser-service request timeout after ${timeoutMs}ms`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new UrlParsingError(message);
  } finally {
    clearTimeout(timer);
  }
}

async function downloadVideoSource(
  serviceUrl: string,
  lectureId: string,
  sourceUrl: string,
  timeoutMs: number
): Promise<DownloadedVideoResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${serviceUrl.replace(/\/+$/, '')}/api/v1/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lectureId, url: sourceUrl }),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text();
      throw new VideoDownloadError(
        `video-parser-service returned ${response.status}: ${body || response.statusText}`
      );
    }
    const payload = (await response.json()) as Partial<DownloadedVideoResponse>;
    const storagePath = String(payload.storagePath ?? '').trim();
    if (!storagePath) {
      throw new VideoDownloadError('video-parser-service returned empty storagePath');
    }
    return {
      lectureId: String(payload.lectureId ?? lectureId),
      sourceUrl: String(payload.sourceUrl ?? sourceUrl),
      storagePath,
      filename: String(payload.filename ?? ''),
      mimeType: String(payload.mimeType ?? 'application/octet-stream')
    };
  } catch (error) {
    if (error instanceof VideoDownloadError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new VideoDownloadError(`video-parser-service request timeout after ${timeoutMs}ms`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new VideoDownloadError(message);
  } finally {
    clearTimeout(timer);
  }
}

class IngestionProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private transcriptionQueue?: Queue;
  private repo: PipelineRepository;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for ingestion-service');
    }
    this.repo = PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
  }

  async onModuleInit() {
    await this.repo.ensureSchema();
    const redis = buildRedisConnection(this.env);

    this.transcriptionQueue = new Queue(QUEUE_NAMES.transcription, {
      ...redis,
      defaultJobOptions: QUEUE_POLICIES.transcription
    });

    this.worker = new Worker(
      QUEUE_NAMES.ingestion,
      async (job: Job<IngestionJobPayload>) => {
        const payload = job.data;
        try {
          await this.repo.updateStatus(payload.jobId, 'INGESTING');

          let relativeStoragePath: string;
          let resolvedMimeType = payload.mimeType;
          if (payload.sourceType === 'upload') {
            if (!payload.fileBase64) {
              throw new Error('Missing fileBase64 for upload sourceType');
            }
            const safeName = payload.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
            relativeStoragePath = path.join('raw', `${payload.lectureId}_${safeName}`);
            await writeArtifact(
              this.env.ARTIFACTS_DIR,
              relativeStoragePath,
              decodeBase64Payload(payload.fileBase64)
            );
          } else if (payload.sourceType === 'url') {
            if (!payload.sourceUrl) {
              throw new Error('Missing sourceUrl for url sourceType');
            }
            if (!this.env.URL_PARSER_SERVICE_URL) {
              throw new Error('URL_PARSER_SERVICE_URL is required for url sourceType');
            }
            const parsed = await parseUrlSource(
              this.env.URL_PARSER_SERVICE_URL,
              payload.sourceUrl,
              payload.requestedLanguage ?? 'ru',
              this.env.URL_PARSER_TIMEOUT_MS
            );
            relativeStoragePath = path.join('raw', `${payload.lectureId}_url.txt`);
            await writeArtifact(this.env.ARTIFACTS_DIR, relativeStoragePath, parsed.text);
            resolvedMimeType = 'text/plain';
          } else {
            if (!payload.sourceUrl) {
              throw new Error('Missing sourceUrl for video_url sourceType');
            }
            if (!this.env.VIDEO_PARSER_SERVICE_URL) {
              throw new Error('VIDEO_PARSER_SERVICE_URL is required for video_url sourceType');
            }
            const downloaded = await downloadVideoSource(
              this.env.VIDEO_PARSER_SERVICE_URL,
              payload.lectureId,
              payload.sourceUrl,
              this.env.VIDEO_PARSER_TIMEOUT_MS
            );
            relativeStoragePath = downloaded.storagePath;
            resolvedMimeType = downloaded.mimeType || payload.mimeType;
          }

          await this.repo.setSourceStoragePath(payload.jobId, relativeStoragePath);
          await this.repo.updateStatus(payload.jobId, 'INGESTED');

          await this.transcriptionQueue?.add('transcribe', {
            jobId: payload.jobId,
            lectureId: payload.lectureId,
            sourceType: payload.sourceType,
            sourceUrl: payload.sourceUrl,
            storagePath: relativeStoragePath,
            mimeType: resolvedMimeType,
            language: payload.requestedLanguage ?? 'ru'
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.repo.setError(payload.jobId, 'INGESTION_ERROR', message);
          throw error;
        }
      },
      {
        ...redis,
        removeOnComplete: QUEUE_POLICIES.ingestion.removeOnComplete,
        removeOnFail: QUEUE_POLICIES.ingestion.removeOnFail
      }
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.transcriptionQueue?.close();
    await this.repo.close();
  }
}

@Controller()
class AppController {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  @Get('/health')
  health() {
    return {
      status: 'ok',
      service: this.env.SERVICE_NAME,
      appEnv: this.env.APP_ENV,
      queue: QUEUE_NAMES.ingestion,
      queuePrefix: this.env.REDIS_QUEUE_PREFIX
    };
  }

  @Get('/ready')
  ready() {
    return { status: 'ready' };
  }
}

@Module({
  imports: [SharedConfigModule.forRoot('ingestion-service')],
  controllers: [AppController],
  providers: [IngestionProcessor]
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = app.get<AppEnv>(APP_ENV);
  await app.listen(env.PORT, '0.0.0.0');
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});

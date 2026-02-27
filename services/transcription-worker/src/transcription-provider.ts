import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
  duration: number;
  language: string;
}

export interface TranscriptionRequest {
  artifactsDir: string;
  storagePath: string;
  requestedLanguage: string;
  mimeType?: string;
}

export class TranscriptionProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'TRANSCRIPTION_PROVIDER_TIMEOUT'
      | 'TRANSCRIPTION_PROVIDER_AUTH'
      | 'TRANSCRIPTION_PROVIDER_RATE_LIMIT'
      | 'TRANSCRIPTION_PROVIDER_BAD_REQUEST'
      | 'TRANSCRIPTION_PROVIDER_UNAVAILABLE'
      | 'TRANSCRIPTION_PROVIDER_ERROR'
  ) {
    super(message);
    this.name = 'TranscriptionProviderError';
  }
}

export interface TranscriptionProvider {
  transcribe(req: TranscriptionRequest): Promise<TranscriptResult>;
}

export interface OpenAIProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface DeepgramProviderOptions {
  apiKey: string;
  baseUrl: string;
  model?: string;
  timeoutMs: number;
}

function sanitizeTranscriptSeed(input: string): string {
  let out = '';
  for (const char of input) {
    const code = char.charCodeAt(0);
    const isNull = code === 0;
    const isControl = (code >= 1 && code <= 8) || (code >= 11 && code <= 12) || (code >= 14 && code <= 31) || code === 127;
    out += isNull || isControl ? ' ' : char;
  }
  return out.replace(/\s+/g, ' ').trim();
}

export class MockTranscriptionProvider implements TranscriptionProvider {
  async transcribe(req: TranscriptionRequest): Promise<TranscriptResult> {
    const absolutePath = path.join(req.artifactsDir, req.storagePath);
    let textSeed = req.storagePath;
    try {
      const payload = await readFile(absolutePath);
      const preview = payload.toString('utf-8').slice(0, 200);
      const sanitized = sanitizeTranscriptSeed(preview);
      textSeed = sanitized || req.storagePath;
    } catch {
      // keep fallback seed from path for non-text artifacts
    }

    const text = `Mock transcript for ${req.storagePath}. seed=${textSeed}`;
    return {
      text,
      segments: [{ start: 0, end: 10, text }],
      duration: 10,
      language: req.requestedLanguage || 'ru'
    };
  }
}

export class OpenAIWhisperTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly options: OpenAIProviderOptions) {}

  async transcribe(req: TranscriptionRequest): Promise<TranscriptResult> {
    const filePath = path.join(req.artifactsDir, req.storagePath);
    const content = await readFile(filePath);

    const formData = new FormData();
    const mime = req.mimeType ?? 'application/octet-stream';
    const fileName = path.basename(req.storagePath);
    formData.append('file', new Blob([content], { type: mime }), fileName);
    formData.append('model', this.options.model);
    if (req.requestedLanguage) {
      formData.append('language', req.requestedLanguage);
    }
    formData.append('response_format', 'verbose_json');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await fetch(`${this.options.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.apiKey}`
        },
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        throw mapHttpError(response.status, await response.text());
      }

      const data = (await response.json()) as {
        text?: string;
        language?: string;
        duration?: number;
        segments?: Array<{ start?: number; end?: number; text?: string }>;
      };

      const text = data.text ?? '';
      const segments = (data.segments ?? []).map((segment) => ({
        start: Number(segment.start ?? 0),
        end: Number(segment.end ?? 0),
        text: String(segment.text ?? '')
      }));

      return {
        text,
        segments,
        duration: Number(data.duration ?? 0),
        language: String(data.language ?? req.requestedLanguage ?? 'unknown')
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TranscriptionProviderError(
          `STT provider request timed out after ${this.options.timeoutMs}ms`,
          'TRANSCRIPTION_PROVIDER_TIMEOUT'
        );
      }
      if (error instanceof TranscriptionProviderError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new TranscriptionProviderError(message, 'TRANSCRIPTION_PROVIDER_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }
}

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly options: DeepgramProviderOptions) {}

  async transcribe(req: TranscriptionRequest): Promise<TranscriptResult> {
    const filePath = path.join(req.artifactsDir, req.storagePath);
    const content = await readFile(filePath);

    const params = new URLSearchParams();
    if (this.options.model) {
      params.set('model', this.options.model);
    }
    if (req.requestedLanguage) {
      params.set('language', req.requestedLanguage);
    }
    const endpoint = `${this.options.baseUrl}/listen${params.size > 0 ? `?${params.toString()}` : ''}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Token ${this.options.apiKey}`,
          'content-type': req.mimeType ?? 'audio/*'
        },
        body: content,
        signal: controller.signal
      });

      if (!response.ok) {
        throw mapHttpError(response.status, await response.text());
      }

      const data = (await response.json()) as {
        metadata?: { duration?: number };
        results?: {
          channels?: Array<{
            alternatives?: Array<{
              transcript?: string;
              words?: Array<{
                start?: number;
                end?: number;
                word?: string;
                punctuated_word?: string;
              }>;
            }>;
          }>;
        };
      };

      const alt = data.results?.channels?.[0]?.alternatives?.[0];
      const text = String(alt?.transcript ?? '').trim();
      const words = alt?.words ?? [];
      const segments =
        words.length > 0
          ? words.map((word) => ({
              start: Number(word.start ?? 0),
              end: Number(word.end ?? word.start ?? 0),
              text: String(word.punctuated_word ?? word.word ?? '').trim()
            }))
          : [{ start: 0, end: Number(data.metadata?.duration ?? 0), text }];

      return {
        text,
        segments,
        duration: Number(data.metadata?.duration ?? (segments[segments.length - 1]?.end ?? 0)),
        language: req.requestedLanguage || 'unknown'
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TranscriptionProviderError(
          `STT provider request timed out after ${this.options.timeoutMs}ms`,
          'TRANSCRIPTION_PROVIDER_TIMEOUT'
        );
      }
      if (error instanceof TranscriptionProviderError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new TranscriptionProviderError(message, 'TRANSCRIPTION_PROVIDER_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }
}

function mapHttpError(status: number, message: string): TranscriptionProviderError {
  if (status === 400) return new TranscriptionProviderError(message, 'TRANSCRIPTION_PROVIDER_BAD_REQUEST');
  if (status === 401 || status === 403)
    return new TranscriptionProviderError(message, 'TRANSCRIPTION_PROVIDER_AUTH');
  if (status === 429)
    return new TranscriptionProviderError(message, 'TRANSCRIPTION_PROVIDER_RATE_LIMIT');
  if (status >= 500)
    return new TranscriptionProviderError(message, 'TRANSCRIPTION_PROVIDER_UNAVAILABLE');
  return new TranscriptionProviderError(message, 'TRANSCRIPTION_PROVIDER_ERROR');
}

export function createTranscriptionProvider(env: {
  TRANSCRIPTION_PROVIDER: 'mock' | 'openai' | 'deepgram';
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  TRANSCRIPTION_OPENAI_MODEL: string;
  DEEPGRAM_API_KEY?: string;
  DEEPGRAM_BASE_URL?: string;
  DEEPGRAM_MODEL?: string;
  TRANSCRIPTION_PROVIDER_TIMEOUT_MS: number;
}): TranscriptionProvider {
  if (env.TRANSCRIPTION_PROVIDER === 'openai') {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required when TRANSCRIPTION_PROVIDER=openai');
    }
    return new OpenAIWhisperTranscriptionProvider({
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      model: env.TRANSCRIPTION_OPENAI_MODEL,
      timeoutMs: env.TRANSCRIPTION_PROVIDER_TIMEOUT_MS
    });
  }
  if (env.TRANSCRIPTION_PROVIDER === 'deepgram') {
    if (!env.DEEPGRAM_API_KEY) {
      throw new Error('DEEPGRAM_API_KEY is required when TRANSCRIPTION_PROVIDER=deepgram');
    }
    return new DeepgramTranscriptionProvider({
      apiKey: env.DEEPGRAM_API_KEY,
      baseUrl: env.DEEPGRAM_BASE_URL ?? 'https://api.deepgram.com/v1',
      model: env.DEEPGRAM_MODEL,
      timeoutMs: env.TRANSCRIPTION_PROVIDER_TIMEOUT_MS
    });
  }
  return new MockTranscriptionProvider();
}

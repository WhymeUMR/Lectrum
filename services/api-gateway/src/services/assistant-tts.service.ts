import { Inject, Injectable } from '@nestjs/common';
import { APP_ENV, AppEnv } from '@lecture/config';

export type AssistantTtsVoice = {
  voiceId: string;
  name: string;
  language: string;
  category: string;
  previewUrl?: string;
};

export type AssistantTtsWordTiming = {
  text: string;
  startMs: number;
  endMs: number;
};

export class AssistantTtsError extends Error {
  constructor(
    public readonly code:
      | 'ASSISTANT_TTS_UNAVAILABLE'
      | 'ASSISTANT_TTS_HTTP_ERROR'
      | 'ASSISTANT_TTS_INVALID_RESPONSE',
    message: string
  ) {
    super(message);
    this.name = 'AssistantTtsError';
  }
}

@Injectable()
export class AssistantTtsService {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  async listVoices(preferredLanguage: 'ru' | 'en' = 'ru'): Promise<{
    voices: AssistantTtsVoice[];
    defaultVoiceId: string;
    ttsModel: string;
  }> {
    const apiKey = readEnvString(this.env, 'ELEVENLABS_API_KEY');
    const baseUrl = readEnvString(this.env, 'ELEVENLABS_BASE_URL') || 'https://api.elevenlabs.io';
    const envVoiceId = readEnvString(this.env, 'ELEVENLABS_VOICE_ID');
    const model = readEnvString(this.env, 'ELEVENLABS_TTS_MODEL') || 'eleven_multilingual_v2';
    if (!apiKey) {
      throw new AssistantTtsError(
        'ASSISTANT_TTS_UNAVAILABLE',
        'ELEVENLABS_API_KEY is required for TTS'
      );
    }

    const raw = await this.fetchVoices(apiKey, baseUrl);
    const voices = raw
      .map((voice) => {
        const labels = voice.labels || {};
        return {
          voiceId: String(voice.voice_id || '').trim(),
          name: String(voice.name || 'Unnamed voice').trim(),
          language: String(labels.language || labels.locale || 'unknown').trim().toLowerCase(),
          category: String(voice.category || 'general').trim().toLowerCase(),
          previewUrl: String(voice.preview_url || '').trim() || undefined
        } as AssistantTtsVoice;
      })
      .filter((item) => item.voiceId)
      .sort((a, b) => {
        const aPref = a.language.includes(preferredLanguage) ? 1 : 0;
        const bPref = b.language.includes(preferredLanguage) ? 1 : 0;
        if (aPref !== bPref) return bPref - aPref;
        return a.name.localeCompare(b.name, 'ru');
      });

    if (voices.length === 0) {
      throw new AssistantTtsError(
        'ASSISTANT_TTS_UNAVAILABLE',
        'No voices available in ElevenLabs account'
      );
    }

    const defaultVoiceId =
      envVoiceId && voices.some((item) => item.voiceId === envVoiceId)
        ? envVoiceId
        : voices[0].voiceId;

    return { voices, defaultVoiceId, ttsModel: model };
  }

  async synthesizeRaw(params: { text: string; ttsModel?: string; ttsVoiceId?: string }): Promise<{
    audioBuffer: Buffer;
    audioMimeType: string;
    model: string;
    chunks: number;
  }> {
    const apiKey = readEnvString(this.env, 'ELEVENLABS_API_KEY');
    const modelFromEnv = readEnvString(this.env, 'ELEVENLABS_TTS_MODEL');
    const voiceFromEnv = readEnvString(this.env, 'ELEVENLABS_VOICE_ID');
    const baseUrlFromEnv = readEnvString(this.env, 'ELEVENLABS_BASE_URL');
    const outputFormatFromEnv = readEnvString(this.env, 'ELEVENLABS_OUTPUT_FORMAT');

    if (!apiKey) {
      throw new AssistantTtsError(
        'ASSISTANT_TTS_UNAVAILABLE',
        'ELEVENLABS_API_KEY is required for TTS'
      );
    }

    const model = params.ttsModel || modelFromEnv || 'eleven_multilingual_v2';
    const preferredLanguage = inferTtsLanguage(params.text);
    const voiceId =
      params.ttsVoiceId ||
      voiceFromEnv ||
      (await this.resolveDefaultVoiceId(apiKey, baseUrlFromEnv || 'https://api.elevenlabs.io', preferredLanguage));
    const baseUrl = baseUrlFromEnv || 'https://api.elevenlabs.io';
    const outputFormat = outputFormatFromEnv || 'mp3_44100_128';
    const timeoutMs = Math.max(20_000, Math.floor(this.env.SUMMARY_AI_TIMEOUT_MS / 2));
    const chunks = splitTextForTts(String(params.text || ''), 1800);

    if (chunks.length === 0) {
      throw new AssistantTtsError('ASSISTANT_TTS_INVALID_RESPONSE', 'TTS text is empty');
    }

    const audioParts: Buffer[] = [];
    for (const chunk of chunks) {
      const chunkAudio = await this.requestChunkAudio({
        baseUrl,
        apiKey,
        voiceId,
        outputFormat,
        model,
        text: chunk,
        timeoutMs
      });
      audioParts.push(chunkAudio);
    }

    const audio = Buffer.concat(audioParts);
    if (audio.length === 0) {
      throw new AssistantTtsError('ASSISTANT_TTS_INVALID_RESPONSE', 'Empty TTS audio');
    }

    return { audioBuffer: audio, audioMimeType: 'audio/mpeg', model, chunks: chunks.length };
  }

  async synthesize(params: { text: string; ttsModel?: string; ttsVoiceId?: string }): Promise<{
    audioBase64: string;
    audioMimeType: string;
    model: string;
    chunks: number;
  }> {
    const raw = await this.synthesizeRaw(params);
    return {
      audioBase64: raw.audioBuffer.toString('base64'),
      audioMimeType: raw.audioMimeType,
      model: raw.model,
      chunks: raw.chunks
    };
  }

  async synthesizeWithTimestamps(params: { text: string; ttsModel?: string; ttsVoiceId?: string }): Promise<{
    audioBase64: string;
    audioMimeType: string;
    model: string;
    chunks: number;
    words: AssistantTtsWordTiming[];
  }> {
    const apiKey = readEnvString(this.env, 'ELEVENLABS_API_KEY');
    const modelFromEnv = readEnvString(this.env, 'ELEVENLABS_TTS_MODEL');
    const voiceFromEnv = readEnvString(this.env, 'ELEVENLABS_VOICE_ID');
    const baseUrlFromEnv = readEnvString(this.env, 'ELEVENLABS_BASE_URL');
    const outputFormatFromEnv = readEnvString(this.env, 'ELEVENLABS_OUTPUT_FORMAT');

    if (!apiKey) {
      throw new AssistantTtsError(
        'ASSISTANT_TTS_UNAVAILABLE',
        'ELEVENLABS_API_KEY is required for TTS'
      );
    }

    const model = params.ttsModel || modelFromEnv || 'eleven_multilingual_v2';
    const preferredLanguage = inferTtsLanguage(params.text);
    const voiceId =
      params.ttsVoiceId ||
      voiceFromEnv ||
      (await this.resolveDefaultVoiceId(apiKey, baseUrlFromEnv || 'https://api.elevenlabs.io', preferredLanguage));
    const baseUrl = baseUrlFromEnv || 'https://api.elevenlabs.io';
    const outputFormat = outputFormatFromEnv || 'mp3_44100_128';
    const timeoutMs = Math.max(20_000, Math.floor(this.env.SUMMARY_AI_TIMEOUT_MS / 2));
    const chunks = splitTextForTts(String(params.text || ''), 1800);

    if (chunks.length === 0) {
      throw new AssistantTtsError('ASSISTANT_TTS_INVALID_RESPONSE', 'TTS text is empty');
    }

    const audioParts: Buffer[] = [];
    const words: AssistantTtsWordTiming[] = [];
    let offsetMs = 0;
    for (const chunk of chunks) {
      const chunkResult = await this.requestChunkAudioWithTimestamps({
        baseUrl,
        apiKey,
        voiceId,
        outputFormat,
        model,
        text: chunk,
        timeoutMs
      });
      audioParts.push(chunkResult.audioBuffer);
      for (const word of chunkResult.words) {
        words.push({
          text: word.text,
          startMs: word.startMs + offsetMs,
          endMs: word.endMs + offsetMs
        });
      }
      const chunkDurationMs = chunkResult.words.length > 0
        ? Math.max(0, chunkResult.words[chunkResult.words.length - 1].endMs)
        : 0;
      offsetMs += chunkDurationMs;
    }

    const audio = Buffer.concat(audioParts);
    if (audio.length === 0) {
      throw new AssistantTtsError('ASSISTANT_TTS_INVALID_RESPONSE', 'Empty TTS audio');
    }

    return {
      audioBase64: audio.toString('base64'),
      audioMimeType: 'audio/mpeg',
      model,
      chunks: chunks.length,
      words
    };
  }

  private async requestChunkAudio(input: {
    baseUrl: string;
    apiKey: string;
    voiceId: string;
    outputFormat: string;
    model: string;
    text: string;
    timeoutMs: number;
  }): Promise<Buffer> {
    const endpoint = `${input.baseUrl}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=${encodeURIComponent(input.outputFormat)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const languageCode = inferTtsLanguage(input.text);
      const normalizedText = input.text;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'xi-api-key': input.apiKey,
          'content-type': 'application/json',
          accept: 'audio/mpeg'
        },
        body: JSON.stringify({
          text: normalizedText,
          model_id: input.model,
          language_code: languageCode
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const message = await safeResponseText(response);
        throw new AssistantTtsError(
          'ASSISTANT_TTS_HTTP_ERROR',
          `ElevenLabs TTS HTTP ${response.status}: ${message}`
        );
      }

      const payload = Buffer.from(await response.arrayBuffer());
      if (!payload.length) {
        throw new AssistantTtsError(
          'ASSISTANT_TTS_INVALID_RESPONSE',
          'ElevenLabs returned empty audio payload'
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof AssistantTtsError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AssistantTtsError(
          'ASSISTANT_TTS_HTTP_ERROR',
          `ElevenLabs TTS timeout after ${input.timeoutMs}ms`
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new AssistantTtsError('ASSISTANT_TTS_HTTP_ERROR', message);
    } finally {
      clearTimeout(timer);
    }
  }

  private async requestChunkAudioWithTimestamps(input: {
    baseUrl: string;
    apiKey: string;
    voiceId: string;
    outputFormat: string;
    model: string;
    text: string;
    timeoutMs: number;
  }): Promise<{ audioBuffer: Buffer; words: AssistantTtsWordTiming[] }> {
    const endpoint = `${input.baseUrl}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps?output_format=${encodeURIComponent(input.outputFormat)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const languageCode = inferTtsLanguage(input.text);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'xi-api-key': input.apiKey,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({
          text: input.text,
          model_id: input.model,
          language_code: languageCode
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const message = await safeResponseText(response);
        throw new AssistantTtsError(
          'ASSISTANT_TTS_HTTP_ERROR',
          `ElevenLabs TTS-with-timestamps HTTP ${response.status}: ${message}`
        );
      }

      const data = (await response.json()) as {
        audio_base64?: string;
        alignment?: {
          characters?: string[];
          character_start_times_seconds?: number[];
          character_end_times_seconds?: number[];
        };
        normalized_alignment?: {
          characters?: string[];
          character_start_times_seconds?: number[];
          character_end_times_seconds?: number[];
        };
      };
      const audioBase64 = String(data.audio_base64 || '').trim();
      if (!audioBase64) {
        throw new AssistantTtsError(
          'ASSISTANT_TTS_INVALID_RESPONSE',
          'ElevenLabs returned empty audio payload'
        );
      }
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const alignment = data.alignment || data.normalized_alignment;
      const words = alignmentToWords(alignment);
      return { audioBuffer, words };
    } catch (error) {
      if (error instanceof AssistantTtsError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AssistantTtsError(
          'ASSISTANT_TTS_HTTP_ERROR',
          `ElevenLabs TTS-with-timestamps timeout after ${input.timeoutMs}ms`
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new AssistantTtsError('ASSISTANT_TTS_HTTP_ERROR', message);
    } finally {
      clearTimeout(timer);
    }
  }

  private async resolveDefaultVoiceId(
    apiKey: string,
    baseUrl: string,
    preferredLanguage: 'ru' | 'en'
  ): Promise<string> {
    const voices = await this.fetchVoices(apiKey, baseUrl);
    if (voices.length === 0) {
      throw new AssistantTtsError(
        'ASSISTANT_TTS_UNAVAILABLE',
        'No voices available in ElevenLabs account'
      );
    }
    const preferred = voices.find((voice) => {
      const labels = voice.labels || {};
      const language = String(labels.language || labels.locale || '').toLowerCase();
      return preferredLanguage === 'ru'
        ? language.includes('ru')
        : language.includes('en');
    });
    const selected = preferred || voices[0];
    const voiceId = String(selected.voice_id || '').trim();
    if (!voiceId) {
      throw new AssistantTtsError(
        'ASSISTANT_TTS_UNAVAILABLE',
        'Could not resolve a valid ElevenLabs voice_id'
      );
    }
    return voiceId;
  }

  private async fetchVoices(
    apiKey: string,
    baseUrl: string
  ): Promise<Array<{
    voice_id?: string;
    name?: string;
    category?: string;
    labels?: Record<string, unknown>;
    preview_url?: string;
  }>> {
    const endpoint = `${baseUrl}/v1/voices`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'xi-api-key': apiKey, accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) {
        const message = await safeResponseText(response);
        throw new AssistantTtsError(
          'ASSISTANT_TTS_HTTP_ERROR',
          `ElevenLabs voices HTTP ${response.status}: ${message}`
        );
      }
      const data = (await response.json()) as {
        voices?: Array<{
          voice_id?: string;
          name?: string;
          category?: string;
          labels?: Record<string, unknown>;
          preview_url?: string;
        }>;
      };
      return Array.isArray(data.voices) ? data.voices : [];
    } catch (error) {
      if (error instanceof AssistantTtsError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AssistantTtsError(
          'ASSISTANT_TTS_HTTP_ERROR',
          'ElevenLabs voices request timeout'
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new AssistantTtsError('ASSISTANT_TTS_HTTP_ERROR', message);
    } finally {
      clearTimeout(timer);
    }
  }
}

function readEnvString(env: AppEnv, key: string): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[key];
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

async function safeResponseText(response: Response): Promise<string> {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    try {
      const json = await response.json() as Record<string, unknown>;
      return String(json.err_msg || json.error || JSON.stringify(json));
    } catch {
      return '';
    }
  }
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function splitTextForTts(text: string, maxChunkChars: number): string[] {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChunkChars) return [normalized];

  const sentences = normalized
    .split(/(?<=[.!?…])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (!sentence) continue;
    if (sentence.length > maxChunkChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < sentence.length; i += maxChunkChars) {
        chunks.push(sentence.slice(i, i + maxChunkChars).trim());
      }
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxChunkChars) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = sentence;
  }
  if (current) chunks.push(current);
  return chunks;
}

function inferTtsLanguage(text: string): 'ru' | 'en' {
  const value = String(text || '');
  const cyr = (value.match(/[А-Яа-яЁё]/g) || []).length;
  const lat = (value.match(/[A-Za-z]/g) || []).length;
  if (cyr > 0) return 'ru';
  return lat > 0 ? 'en' : 'ru';
}

function normalizeRuTextForTts(text: string): string {
  let out = String(text || '');

  // Strict deterministic mode:
  // Keep original sentence structure and wording.
  // Transform only numeric tokens (mostly years/numbers) into pronounceable forms.

  // Year ranges with explicit case suffix.
  out = out.replace(
    /\b(1\d{3}|20\d{2}|21\d{2})\s*[–—-]\s*(1\d{3}|20\d{2}|21\d{2})\s+годах\b/gi,
    (_m, y1Raw, y2Raw) => {
      const y1 = Number(y1Raw);
      const y2 = Number(y2Raw);
      return `${yearToOrdinalRu(y1, 'prep')} — ${yearToOrdinalRu(y2, 'prep')} годах`;
    }
  );
  out = out.replace(
    /\b(1\d{3}|20\d{2}|21\d{2})\s*[–—-]\s*(1\d{3}|20\d{2}|21\d{2})\s+года\b/gi,
    (_m, y1Raw, y2Raw) => {
      const y1 = Number(y1Raw);
      const y2 = Number(y2Raw);
      return `${yearToOrdinalRu(y1, 'gen')} — ${yearToOrdinalRu(y2, 'gen')} года`;
    }
  );
  out = out.replace(
    /\b(1\d{3}|20\d{2}|21\d{2})\s*[–—-]\s*(1\d{3}|20\d{2}|21\d{2})\s+году\b/gi,
    (_m, y1Raw, y2Raw) => {
      const y1 = Number(y1Raw);
      const y2 = Number(y2Raw);
      return `${yearToOrdinalRu(y1, 'prep')} — ${yearToOrdinalRu(y2, 'prep')} году`;
    }
  );
  out = out.replace(
    /\b(1\d{3}|20\d{2}|21\d{2})\s*[–—-]\s*(1\d{3}|20\d{2}|21\d{2})\s+год\b/gi,
    (_m, y1Raw, y2Raw) => {
      const y1 = Number(y1Raw);
      const y2 = Number(y2Raw);
      return `${yearToOrdinalRu(y1, 'nom')} — ${yearToOrdinalRu(y2, 'nom')} год`;
    }
  );
  // Bare year range without suffix: keep format, read as cardinal years.
  out = out.replace(
    /\b(1\d{3}|20\d{2}|21\d{2})\s*[–—-]\s*(1\d{3}|20\d{2}|21\d{2})\b/g,
    (_m, y1Raw, y2Raw) => `${yearToWordsRu(Number(y1Raw))} — ${yearToWordsRu(Number(y2Raw))}`
  );

  // Single year with case.
  out = out.replace(/\bв\s+(1\d{3}|20\d{2}|21\d{2})\s+году\b/gi, (_m, yRaw) => {
    const year = Number(yRaw);
    return `в ${yearToOrdinalRu(year, 'prep')} году`;
  });
  out = out.replace(/\b(1\d{3}|20\d{2}|21\d{2})\s+году\b/gi, (_m, yRaw) => {
    const year = Number(yRaw);
    return `${yearToOrdinalRu(year, 'prep')} году`;
  });
  out = out.replace(/\b(1\d{3}|20\d{2}|21\d{2})\s+года\b/gi, (_m, yRaw) => {
    const year = Number(yRaw);
    return `${yearToOrdinalRu(year, 'gen')} года`;
  });
  out = out.replace(/\b(1\d{3}|20\d{2}|21\d{2})\s+год\b/gi, (_m, yRaw) => {
    const year = Number(yRaw);
    return `${yearToOrdinalRu(year, 'nom')} год`;
  });

  // "в 1937" -> "в ... году" (only when year word is absent).
  out = out.replace(/\bв\s+(1\d{3}|20\d{2}|21\d{2})\b(?!\s+г(?:\.|од))/gi, (_m, yRaw) => `в ${yearToOrdinalRu(Number(yRaw), 'prep')} году`);

  // 2024 г. / 2024 год / 2024 года / 2024 году
  out = out.replace(/\b(1\d{3}|20\d{2}|21\d{2})\s*(г\.?|год(?:а|у|ом)?)\b/gi, (_m, yRaw, suffixRaw) => {
    const year = Number(yRaw);
    const suffix = String(suffixRaw || '').toLowerCase();
    if (suffix === 'году') {
      return `${yearToOrdinalRu(year, 'prep')} году`;
    }
    if (suffix === 'года') {
      return `${yearToOrdinalRu(year, 'gen')} года`;
    }
    if (suffix === 'годом') {
      // Practical fallback for TTS: genitive sounds natural enough and avoids wrong nominative.
      return `${yearToOrdinalRu(year, 'gen')} годом`;
    }
    return `${yearToOrdinalRu(year, 'nom')} год`;
  });

  // Standalone year in brackets/phrases.
  out = out.replace(/\((1\d{3}|20\d{2}|21\d{2})\)/g, (_m, yRaw) => {
    const year = Number(yRaw);
    return `(${yearToOrdinalRu(year, 'nom')} год)`;
  });

  // Remaining plain 4-digit years (not bound to "год*").
  out = out.replace(/\b(1\d{3}|20\d{2}|21\d{2})\b/g, (raw) => yearToWordsRu(Number(raw)));

  // Other standalone numbers: cardinal words, without changing phrasing.
  out = out.replace(/\b\d{2,6}\b/g, (raw) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return raw;
    return numberToWordsRu(value);
  });

  // Defensive cleanup for duplicated grammatical suffixes produced by mixed templates.
  out = out.replace(/\bгоду\s+году\b/gi, 'году');
  out = out.replace(/\bгоду\s+годах\b/gi, 'годах');
  out = out.replace(/\bгода\s+года\b/gi, 'года');
  out = out.replace(/\bгоды\s+годах\b/gi, 'годах');
  out = out.replace(/\bгод\s+годах\b/gi, 'годах');
  out = out.replace(/\bгоды\s+году\b/gi, 'году');
  out = out.replace(/\bгод\s+году\b/gi, 'году');

  // Hard post-fix for ordinal adjective + "год*" agreement.
  out = fixOrdinalYearAgreementRu(out);

  return out.replace(/\s+/g, ' ').trim();
}

function alignmentToWords(
  alignment?: {
    characters?: string[];
    character_start_times_seconds?: number[];
    character_end_times_seconds?: number[];
  }
): AssistantTtsWordTiming[] {
  if (!alignment) return [];
  const chars = Array.isArray(alignment.characters) ? alignment.characters : [];
  const starts = Array.isArray(alignment.character_start_times_seconds)
    ? alignment.character_start_times_seconds
    : [];
  const ends = Array.isArray(alignment.character_end_times_seconds)
    ? alignment.character_end_times_seconds
    : [];
  const len = Math.min(chars.length, starts.length, ends.length);
  if (len === 0) return [];

  const words: AssistantTtsWordTiming[] = [];
  let currentText = '';
  let currentStart = 0;
  let currentEnd = 0;
  let inWord = false;

  for (let i = 0; i < len; i++) {
    const ch = String(chars[i] ?? '');
    const isSpace = /\s/.test(ch);
    const s = Math.max(0, Number(starts[i] ?? 0));
    const e = Math.max(s, Number(ends[i] ?? s));

    if (isSpace) {
      if (inWord && currentText.trim()) {
        words.push({
          text: currentText.trim(),
          startMs: Math.round(currentStart * 1000),
          endMs: Math.round(currentEnd * 1000)
        });
      }
      currentText = '';
      inWord = false;
      continue;
    }

    if (!inWord) {
      inWord = true;
      currentText = ch;
      currentStart = s;
      currentEnd = e;
      continue;
    }
    currentText += ch;
    currentEnd = e;
  }

  if (inWord && currentText.trim()) {
    words.push({
      text: currentText.trim(),
      startMs: Math.round(currentStart * 1000),
      endMs: Math.round(currentEnd * 1000)
    });
  }
  return words;
}

function fixOrdinalYearAgreementRu(text: string): string {
  let out = String(text || '');

  // "... седьмой году" -> "... седьмом году", "... третий году" -> "... третьем году"
  out = out.replace(/\b([А-Яа-яЁё-]+?)(ый|ой)\s+году\b/g, (_m, stem) => `${stem}ом году`);
  out = out.replace(/\b([А-Яа-яЁё-]+?)ий\s+году\b/g, (_m, stem) => `${stem}ьем году`);

  // "... седьмой года" -> "... седьмого года"
  out = out.replace(/\b([А-Яа-яЁё-]+?)(ый|ой)\s+года\b/g, (_m, stem) => `${stem}ого года`);
  out = out.replace(/\b([А-Яа-яЁё-]+?)ий\s+года\b/g, (_m, stem) => `${stem}ьего года`);

  // "... седьмой годах" -> "... седьмых годах"
  out = out.replace(/\b([А-Яа-яЁё-]+?)(ый|ой)\s+годах\b/g, (_m, stem) => `${stem}ых годах`);
  out = out.replace(/\b([А-Яа-яЁё-]+?)ий\s+годах\b/g, (_m, stem) => `${stem}ьих годах`);

  return out;
}

function isValidDateParts(day: number, month: number): boolean {
  return Number.isInteger(day) && Number.isInteger(month) && day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

function monthGenitiveRu(month: number): string {
  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря'
  ];
  return months[Math.max(1, Math.min(12, month)) - 1];
}

function yearToWordsRu(year: number): string {
  if (!Number.isFinite(year) || year < 1000 || year > 2999) {
    return String(Math.floor(year));
  }
  return numberToWordsRu(year);
}

function yearToOrdinalRu(year: number, grammaticalCase: 'nom' | 'gen' | 'prep'): string {
  if (!Number.isFinite(year) || year < 1000 || year > 2999) {
    return numberToWordsRu(Math.floor(year));
  }
  const head = Math.floor(year / 100) * 100;
  const tail = year % 100;
  const headText = head > 0 ? numberToWordsRu(head) : '';
  const tailText = tail === 0
    ? (grammaticalCase === 'nom' ? 'сотый' : grammaticalCase === 'gen' ? 'сотого' : 'сотом')
    : ordinalUnder100Ru(tail, grammaticalCase);
  return `${headText} ${tailText}`.replace(/\s+/g, ' ').trim();
}

function ordinalUnder100Ru(n: number, grammaticalCase: 'nom' | 'gen' | 'prep'): string {
  const unitsNom: Record<number, string> = {
    1: 'первый', 2: 'второй', 3: 'третий', 4: 'четвертый', 5: 'пятый',
    6: 'шестой', 7: 'седьмой', 8: 'восьмой', 9: 'девятый'
  };
  const unitsGen: Record<number, string> = {
    1: 'первого', 2: 'второго', 3: 'третьего', 4: 'четвертого', 5: 'пятого',
    6: 'шестого', 7: 'седьмого', 8: 'восьмого', 9: 'девятого'
  };
  const unitsPrep: Record<number, string> = {
    1: 'первом', 2: 'втором', 3: 'третьем', 4: 'четвертом', 5: 'пятом',
    6: 'шестом', 7: 'седьмом', 8: 'восьмом', 9: 'девятом'
  };
  const teensNom: Record<number, string> = {
    10: 'десятый', 11: 'одиннадцатый', 12: 'двенадцатый', 13: 'тринадцатый', 14: 'четырнадцатый',
    15: 'пятнадцатый', 16: 'шестнадцатый', 17: 'семнадцатый', 18: 'восемнадцатый', 19: 'девятнадцатый'
  };
  const teensGen: Record<number, string> = {
    10: 'десятого', 11: 'одиннадцатого', 12: 'двенадцатого', 13: 'тринадцатого', 14: 'четырнадцатого',
    15: 'пятнадцатого', 16: 'шестнадцатого', 17: 'семнадцатого', 18: 'восемнадцатого', 19: 'девятнадцатого'
  };
  const teensPrep: Record<number, string> = {
    10: 'десятом', 11: 'одиннадцатом', 12: 'двенадцатом', 13: 'тринадцатом', 14: 'четырнадцатом',
    15: 'пятнадцатом', 16: 'шестнадцатом', 17: 'семнадцатом', 18: 'восемнадцатом', 19: 'девятнадцатом'
  };
  const tensNom: Record<number, string> = {
    2: 'двадцатый', 3: 'тридцатый', 4: 'сороковой', 5: 'пятидесятый',
    6: 'шестидесятый', 7: 'семидесятый', 8: 'восьмидесятый', 9: 'девяностый'
  };
  const tensGen: Record<number, string> = {
    2: 'двадцатого', 3: 'тридцатого', 4: 'сорокового', 5: 'пятидесятого',
    6: 'шестидесятого', 7: 'семидесятого', 8: 'восьмидесятого', 9: 'девяностого'
  };
  const tensPrep: Record<number, string> = {
    2: 'двадцатом', 3: 'тридцатом', 4: 'сороковом', 5: 'пятидесятом',
    6: 'шестидесятом', 7: 'семидесятом', 8: 'восьмидесятом', 9: 'девяностом'
  };
  const tensCardinal: Record<number, string> = {
    2: 'двадцать', 3: 'тридцать', 4: 'сорок', 5: 'пятьдесят',
    6: 'шестьдесят', 7: 'семьдесят', 8: 'восемьдесят', 9: 'девяносто'
  };

  if (n <= 0 || n >= 100) return numberToWordsRu(n);
  if (n >= 10 && n <= 19) {
    if (grammaticalCase === 'nom') return teensNom[n];
    if (grammaticalCase === 'gen') return teensGen[n];
    return teensPrep[n];
  }

  const t = Math.floor(n / 10);
  const u = n % 10;
  if (u === 0) {
    if (grammaticalCase === 'nom') return tensNom[t];
    if (grammaticalCase === 'gen') return tensGen[t];
    return tensPrep[t];
  }

  const uWord = grammaticalCase === 'nom' ? unitsNom[u] : grammaticalCase === 'gen' ? unitsGen[u] : unitsPrep[u];
  return `${tensCardinal[t]} ${uWord}`;
}

function numberToWordsRu(value: number): string {
  const n = Math.floor(Math.max(0, value));
  if (n === 0) return 'ноль';

  const units = [
    '',
    'один',
    'два',
    'три',
    'четыре',
    'пять',
    'шесть',
    'семь',
    'восемь',
    'девять'
  ];
  const teens = [
    'десять',
    'одиннадцать',
    'двенадцать',
    'тринадцать',
    'четырнадцать',
    'пятнадцать',
    'шестнадцать',
    'семнадцать',
    'восемнадцать',
    'девятнадцать'
  ];
  const tens = [
    '',
    '',
    'двадцать',
    'тридцать',
    'сорок',
    'пятьдесят',
    'шестьдесят',
    'семьдесят',
    'восемьдесят',
    'девяносто'
  ];
  const hundreds = [
    '',
    'сто',
    'двести',
    'триста',
    'четыреста',
    'пятьсот',
    'шестьсот',
    'семьсот',
    'восемьсот',
    'девятьсот'
  ];

  const parts: string[] = [];
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;

  if (thousands > 0) {
    if (thousands === 1) {
      parts.push('тысяча');
    } else if (thousands === 2) {
      parts.push('две тысячи');
    } else if (thousands >= 3 && thousands <= 4) {
      parts.push(`${units[thousands]} тысячи`);
    } else {
      parts.push(`${numberBelowThousandToWords(thousands, units, teens, tens, hundreds)} тысяч`);
    }
  }

  if (rest > 0) {
    parts.push(numberBelowThousandToWords(rest, units, teens, tens, hundreds));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function numberBelowThousandToWords(
  n: number,
  units: string[],
  teens: string[],
  tens: string[],
  hundreds: string[]
): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const out: string[] = [];
  if (h > 0) out.push(hundreds[h]);
  if (t === 1) {
    out.push(teens[u]);
    return out.join(' ');
  }
  if (t > 1) out.push(tens[t]);
  if (u > 0) out.push(units[u]);
  return out.join(' ');
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.floor(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

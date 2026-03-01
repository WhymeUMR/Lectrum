import { Inject, Injectable } from '@nestjs/common';
import { APP_ENV, AppEnv } from '@lecture/config';

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
      const normalizedText =
        languageCode === 'ru'
          ? normalizeRuTextForTts(input.text)
          : input.text;
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

  private async resolveDefaultVoiceId(
    apiKey: string,
    baseUrl: string,
    preferredLanguage: 'ru' | 'en'
  ): Promise<string> {
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
        voices?: Array<{ voice_id?: string; name?: string; labels?: Record<string, unknown> }>;
      };
      const voices = Array.isArray(data.voices) ? data.voices : [];
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

  // 12:30 -> 12 часов 30 минут
  out = out.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_match, hRaw, mRaw) => {
    const h = Number(hRaw);
    const m = Number(mRaw);
    return `${numberToWordsRu(h)} ${pluralRu(h, 'час', 'часа', 'часов')} ${numberToWordsRu(m)} ${pluralRu(m, 'минута', 'минуты', 'минут')}`;
  });

  // 02.08.2024 / 02-08-2024 / 02/08/2024
  out = out.replace(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/g, (_m, dRaw, mRaw, yRaw) => {
    const day = Number(dRaw);
    const month = Number(mRaw);
    let year = Number(yRaw);
    if (!isValidDateParts(day, month)) return `${dRaw}.${mRaw}.${yRaw}`;
    if (yRaw.length === 2) {
      year += year >= 70 ? 1900 : 2000;
    }
    const monthWord = monthGenitiveRu(month);
    return `${day} ${monthWord} ${yearToWordsRu(year)} года`;
  });

  // 02.08 / 02-08 / 02/08
  out = out.replace(/\b(\d{1,2})[./-](\d{1,2})\b/g, (_m, dRaw, mRaw) => {
    const day = Number(dRaw);
    const month = Number(mRaw);
    if (!isValidDateParts(day, month)) return `${dRaw}.${mRaw}`;
    return `${day} ${monthGenitiveRu(month)}`;
  });

  // 2024 г. / 2024 год -> две тысячи двадцать четыре года
  out = out.replace(/\b(1\d{3}|20\d{2}|21\d{2})\s*(г\.?|год(?:а|у|ом)?)\b/gi, (_m, yRaw) => {
    const year = Number(yRaw);
    return `${yearToWordsRu(year)} года`;
  });

  // Standalone numbers -> words (e.g. 1800 -> тысяча восемьсот).
  // Keep short 1-digit numbers as-is to avoid over-normalizing enumerations.
  out = out.replace(/\b\d{2,6}\b/g, (raw) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return raw;
    if (value > 999999) return raw;
    return numberToWordsRu(value);
  });

  return out.replace(/\s+/g, ' ').trim();
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

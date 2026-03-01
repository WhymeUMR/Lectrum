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

  // Keep original structure for ranges; only inflect year numerals.
  // "1893-1896 годах" -> "тысяча ... третьем - тысяча ... шестом годах"
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

  // "в 1937 году" -> "в тысяча девятьсот тридцать седьмом году"
  out = out.replace(/\bв\s+(1\d{3}|20\d{2}|21\d{2})\s+году\b/gi, (_m, yRaw) => {
    const year = Number(yRaw);
    return `в ${yearToOrdinalRu(year, 'prep')} году`;
  });

  // "в 1937" -> "в ... году" (only when year word is absent).
  out = out.replace(/\bв\s+(1\d{3}|20\d{2}|21\d{2})\b(?!\s+г(?:\.|од))/gi, (_m, yRaw) => `в ${yearToOrdinalRu(Number(yRaw), 'prep')} году`);

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

  // Standalone year in brackets/phrases: "(1937)" -> "(... год)"
  out = out.replace(/\((1\d{3}|20\d{2}|21\d{2})\)/g, (_m, yRaw) => {
    const year = Number(yRaw);
    return `(${yearToOrdinalRu(year, 'nom')} год)`;
  });

  // Do not rewrite every number: keep UI/text parity high and avoid semantic drift.
  // Only remaining plain 4-digit years are converted.
  out = out.replace(/\b(1\d{3}|20\d{2}|21\d{2})\b/g, (raw) => yearToWordsRu(Number(raw)));

  // Defensive cleanup for duplicated grammatical suffixes produced by mixed templates.
  out = out.replace(/\bгоду\s+году\b/gi, 'году');
  out = out.replace(/\bгоду\s+годах\b/gi, 'годах');
  out = out.replace(/\bгода\s+года\b/gi, 'года');
  out = out.replace(/\bгоды\s+годах\b/gi, 'годах');
  out = out.replace(/\bгод\s+годах\b/gi, 'годах');
  out = out.replace(/\bгоды\s+году\b/gi, 'году');
  out = out.replace(/\bгод\s+году\b/gi, 'году');

  // Hard post-fix for ordinal adjective + "год*" agreement.
  // This is intentionally strict for TTS stability: we prefer deterministic grammar over model guessing.
  out = fixOrdinalYearAgreementRu(out);

  return out.replace(/\s+/g, ' ').trim();
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

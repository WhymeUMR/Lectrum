export interface TranscriptWordLike {
  start?: number;
  end?: number;
  text?: string;
}

export interface TranscriptData {
  text?: string;
  duration?: number;
  segments?: TranscriptWordLike[];
}

export interface TranscriptHighlight {
  start: number;
  end: number;
  text: string;
  reason: string;
}

export class HighlightGenerationError extends Error {
  constructor(
    public readonly code:
      | 'HIGHLIGHTS_AI_UNAVAILABLE'
      | 'HIGHLIGHTS_AI_HTTP_ERROR'
      | 'HIGHLIGHTS_AI_INVALID_RESPONSE'
      | 'HIGHLIGHTS_EMPTY_TRANSCRIPT',
    message: string
  ) {
    super(message);
    this.name = 'HighlightGenerationError';
  }
}

interface Chunk {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface HighlightGenerationOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export async function generateHighlights(
  transcript: TranscriptData,
  options: HighlightGenerationOptions,
  maxHighlights = 30
): Promise<TranscriptHighlight[]> {
  const hasTranscriptText = String(transcript.text ?? '').trim().length > 0;
  const hasSegmentText = (transcript.segments ?? []).some(
    (segment) => String(segment.text ?? '').trim().length > 0
  );
  if (!hasTranscriptText && !hasSegmentText) {
    throw new HighlightGenerationError(
      'HIGHLIGHTS_EMPTY_TRANSCRIPT',
      'Cannot generate highlights: transcript is empty'
    );
  }

  const { chunks, targetCount } = toChunks(transcript, maxHighlights);
  if (chunks.length === 0) {
    throw new HighlightGenerationError(
      'HIGHLIGHTS_EMPTY_TRANSCRIPT',
      'Cannot generate highlights: transcript does not contain enough text'
    );
  }
  if (!options.apiKey) {
    throw new HighlightGenerationError(
      'HIGHLIGHTS_AI_UNAVAILABLE',
      'OPENAI_API_KEY is required for AI highlights generation'
    );
  }
  return llmHighlights(chunks, targetCount, {
    ...options,
    apiKey: options.apiKey
  });
}

function toChunks(transcript: TranscriptData, maxHighlights: number): { chunks: Chunk[]; targetCount: number } {
  const segments = (transcript.segments ?? [])
    .map((segment) => ({
      start: Number(segment.start ?? 0),
      end: Number(segment.end ?? segment.start ?? 0),
      text: String(segment.text ?? '').trim()
    }))
    .filter((segment) => segment.text.length > 0);

  const durationFromSegments = segments.reduce((max, s) => Math.max(max, s.end), 0);
  const duration = Math.max(Number(transcript.duration ?? 0), durationFromSegments, 1);
  const targetCount = targetHighlightsByDuration(duration, maxHighlights);

  const windowSize = pickWindowSize(duration, targetCount);
  const fullText = String(transcript.text ?? '').trim();

  const chunks: Chunk[] = [];
  for (let i = 0; i < targetCount; i += 1) {
    const center = ((i + 0.5) * duration) / targetCount;
    const start = Math.max(0, Math.round(center - windowSize / 2));
    const end = Math.min(Math.round(center + windowSize / 2), Math.ceil(duration));
    const text = pickWindowText(segments, fullText, i, targetCount, start, end);
    chunks.push({
      id: i + 1,
      start,
      end: Math.max(start + 5, end),
      text
    });
  }
  return { chunks, targetCount };
}

function targetHighlightsByDuration(durationSec: number, maxHighlights: number): number {
  // Keep count useful but bounded so long lectures do not overload LLM output quality.
  const dynamic = 5 + Math.floor(durationSec / 900);
  return Math.max(5, Math.min(maxHighlights, 12, dynamic));
}

function pickWindowSize(durationSec: number, targetCount: number): number {
  const proposed = Math.round(durationSec / (targetCount * 2));
  return Math.max(20, Math.min(120, proposed));
}

function pickWindowText(
  segments: Array<{ start: number; end: number; text: string }>,
  fullText: string,
  index: number,
  total: number,
  start: number,
  end: number
): string {
  const fromSegments = segments
    .filter((segment) => segment.end >= start && segment.start <= end)
    .map((segment) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (fromSegments.length >= 20) {
    return fromSegments.slice(0, 480);
  }

  if (!fullText) {
    return `Фрагмент ${index + 1}`;
  }
  const approxLen = Math.max(120, Math.floor(fullText.length / Math.max(1, total)));
  const from = Math.min(fullText.length, Math.floor((index / total) * fullText.length));
  const to = Math.min(fullText.length, from + approxLen);
  return fullText.slice(from, to).replace(/\s+/g, ' ').trim().slice(0, 480) || `Фрагмент ${index + 1}`;
}

async function llmHighlights(
  chunks: Chunk[],
  maxHighlights: number,
  options: Required<Pick<HighlightGenerationOptions, 'apiKey'>> & HighlightGenerationOptions
): Promise<TranscriptHighlight[]> {
  const limited = chunks.slice(0, maxHighlights);
  const prompt = [
    `Сформируй ${maxHighlights} важных таймкодов по лекции.`,
    'Таймкоды должны покрывать лекцию равномерно по времени.',
    'Ответ строго JSON-объектом вида {"highlights":[{"id":number,"summary":string,"reason":string}]}.',
    'id должен быть только из списка фрагментов ниже и не должен повторяться.',
    'summary: осмысленное краткое изложение фрагмента (не цитата, 1-2 предложения, до 220 символов).',
    'reason: почему этот фрагмент важен (до 120 символов).',
    ...limited.map((chunk) => `id=${chunk.id} [${chunk.start.toFixed(2)}-${chunk.end.toFixed(2)}] ${chunk.text}`)
  ].join('\n');

  const timeoutMs = Math.max(30_000, Math.floor(Number(options.timeoutMs ?? 90_000)));
  const parsed = await requestHighlightsJson(prompt, options, timeoutMs);
  const chunkById = new Map(limited.map((chunk) => [chunk.id, chunk]));

  const out: TranscriptHighlight[] = [];
  const used = new Set<number>();
  for (const item of parsed.highlights ?? []) {
    const id = Number(item.id);
    const chunk = chunkById.get(id);
    if (!chunk || used.has(id)) {
      continue;
    }
    const summary = String(item.summary ?? '').trim();
    if (!summary) {
      continue;
    }
    used.add(id);
    out.push({
      start: Math.round(chunk.start),
      end: Math.round(chunk.end),
      text: summary.slice(0, 220),
      reason: String(item.reason ?? 'Важный фрагмент').trim().slice(0, 120)
    });
  }

  if (out.length < maxHighlights) {
    fillMissingHighlights(out, used, limited, maxHighlights);
  }

  return out
    .sort((a, b) => a.start - b.start)
    .map((item) => ({
      start: item.start,
      end: Math.max(item.start + 5, item.end),
      text: item.text,
      reason: item.reason
    }));
}

async function requestHighlightsJson(
  prompt: string,
  options: Required<Pick<HighlightGenerationOptions, 'apiKey'>> & HighlightGenerationOptions,
  timeoutMs: number
): Promise<{ highlights?: Array<{ id?: number; summary?: string; reason?: string }> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${options.baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: options.model ?? 'gpt-4.1-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Ты аналитик лекций. Определи ключевые фрагменты, которые лучше всего отражают смысл материала.'
          },
          { role: 'user', content: prompt }
        ]
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      throw new HighlightGenerationError('HIGHLIGHTS_AI_HTTP_ERROR', `LLM HTTP ${res.status}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new HighlightGenerationError('HIGHLIGHTS_AI_INVALID_RESPONSE', 'Empty LLM highlight response');
    }

    return parseHighlightsJsonLoose(content);
  } catch (error) {
    if (error instanceof HighlightGenerationError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HighlightGenerationError(
        'HIGHLIGHTS_AI_HTTP_ERROR',
        `LLM highlight request timeout after ${timeoutMs}ms`
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new HighlightGenerationError('HIGHLIGHTS_AI_HTTP_ERROR', message);
  } finally {
    clearTimeout(timer);
  }
}

function parseHighlightsJsonLoose(content: string): { highlights?: Array<{ id?: number; summary?: string; reason?: string }> } {
  try {
    return JSON.parse(content) as { highlights?: Array<{ id?: number; summary?: string; reason?: string }> };
  } catch {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim()) as { highlights?: Array<{ id?: number; summary?: string; reason?: string }> };
      } catch {
        // noop
      }
    }
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1)) as { highlights?: Array<{ id?: number; summary?: string; reason?: string }> };
      } catch {
        // noop
      }
    }
    throw new HighlightGenerationError('HIGHLIGHTS_AI_INVALID_RESPONSE', 'Malformed JSON in highlight response');
  }
}

function fillMissingHighlights(
  out: TranscriptHighlight[],
  used: Set<number>,
  chunks: Chunk[],
  expectedCount: number
): void {
  if (out.length >= expectedCount) return;
  for (const chunk of chunks) {
    if (used.has(chunk.id)) continue;
    out.push({
      start: Math.round(chunk.start),
      end: Math.round(chunk.end),
      text: trimSummary(chunk.text),
      reason: 'Ключевой фрагмент лекции'
    });
    used.add(chunk.id);
    if (out.length >= expectedCount) return;
  }
}

function trimSummary(text: string): string {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= 220) return normalized || 'Важный фрагмент';
  const cut = normalized.slice(0, 220);
  const sentenceEnd = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  if (sentenceEnd >= 100) return cut.slice(0, sentenceEnd + 1).trim();
  return `${cut.slice(0, 217).trim()}...`;
}

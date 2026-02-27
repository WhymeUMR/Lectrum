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
  const dynamic = 6 + Math.floor(durationSec / 360);
  return Math.max(5, Math.min(maxHighlights, dynamic));
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
    })
  });

  if (!res.ok) {
    throw new HighlightGenerationError('HIGHLIGHTS_AI_HTTP_ERROR', `LLM HTTP ${res.status}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new HighlightGenerationError('HIGHLIGHTS_AI_INVALID_RESPONSE', 'Empty LLM highlight response');
  }

  const parsed = JSON.parse(content) as {
    highlights?: Array<{ id?: number; summary?: string; reason?: string }>;
  };
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
    throw new HighlightGenerationError(
      'HIGHLIGHTS_AI_INVALID_RESPONSE',
      `AI returned ${out.length} highlights, expected ${maxHighlights}`
    );
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

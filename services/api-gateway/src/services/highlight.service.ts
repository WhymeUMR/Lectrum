import { Inject, Injectable } from '@nestjs/common';
import { APP_ENV, AppEnv } from '@lecture/config';

export interface TranscriptWordLike {
  start?: number;
  end?: number;
  text?: string;
}

export interface TranscriptData {
  text?: string;
  segments?: TranscriptWordLike[];
}

export interface TranscriptHighlight {
  start: number;
  end: number;
  text: string;
  reason: string;
}

interface Chunk {
  id: number;
  start: number;
  end: number;
  text: string;
}

@Injectable()
export class HighlightService {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  async getHighlights(transcript: TranscriptData, maxHighlights = 5): Promise<TranscriptHighlight[]> {
    const chunks = this.toChunks(transcript);
    if (chunks.length === 0) {
      return [];
    }
    if (!this.env.OPENAI_API_KEY) {
      return this.fallbackHighlights(chunks, maxHighlights);
    }
    try {
      return await this.llmHighlights(chunks, maxHighlights);
    } catch {
      return this.fallbackHighlights(chunks, maxHighlights);
    }
  }

  private toChunks(transcript: TranscriptData): Chunk[] {
    const words = (transcript.segments ?? [])
      .map((segment) => ({
        start: Number(segment.start ?? 0),
        end: Number(segment.end ?? segment.start ?? 0),
        text: String(segment.text ?? '').trim()
      }))
      .filter((word) => word.text.length > 0);

    if (words.length === 0) {
      const text = String(transcript.text ?? '').trim();
      return text ? [{ id: 1, start: 0, end: 0, text }] : [];
    }

    const chunks: Chunk[] = [];
    let i = 0;
    let chunkId = 1;
    while (i < words.length) {
      const slice = words.slice(i, i + 22);
      chunks.push({
        id: chunkId,
        start: slice[0].start,
        end: slice[slice.length - 1].end,
        text: slice.map((word) => word.text).join(' ')
      });
      chunkId += 1;
      i += 22;
    }
    return chunks;
  }

  private fallbackHighlights(chunks: Chunk[], maxHighlights: number): TranscriptHighlight[] {
    if (chunks.length <= maxHighlights) {
      return chunks.map((chunk) => ({
        start: chunk.start,
        end: chunk.end,
        text: chunk.text,
        reason: 'Опорный фрагмент'
      }));
    }
    const step = Math.max(1, Math.floor(chunks.length / maxHighlights));
    const picked = [];
    for (let i = 0; i < chunks.length && picked.length < maxHighlights; i += step) {
      picked.push(chunks[i]);
    }
    return picked.map((chunk) => ({
      start: chunk.start,
      end: chunk.end,
      text: chunk.text,
      reason: 'Важный фрагмент по эвристике'
    }));
  }

  private async llmHighlights(chunks: Chunk[], maxHighlights: number): Promise<TranscriptHighlight[]> {
    const limited = chunks.slice(0, 120);
    const prompt = [
      `Выбери ${maxHighlights} самых важных фрагментов лекции.`,
      'Ответ строго JSON-объектом вида {"highlights":[{"id":number,"reason":string}]}.',
      'id должен быть только из списка фрагментов ниже, reason короткий (до 120 символов).',
      ...limited.map((chunk) => `id=${chunk.id} [${chunk.start.toFixed(2)}-${chunk.end.toFixed(2)}] ${chunk.text}`)
    ].join('\n');

    const res = await fetch(`${this.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: this.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
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
      throw new Error(`LLM HTTP ${res.status}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty LLM highlight response');
    }
    const parsed = JSON.parse(content) as {
      highlights?: Array<{ id?: number; reason?: string }>;
    };
    const chunkById = new Map(limited.map((chunk) => [chunk.id, chunk]));

    const out: TranscriptHighlight[] = [];
    for (const item of parsed.highlights ?? []) {
      const id = Number(item.id);
      const chunk = chunkById.get(id);
      if (!chunk) {
        continue;
      }
      out.push({
        start: chunk.start,
        end: chunk.end,
        text: chunk.text,
        reason: String(item.reason ?? 'Важный фрагмент')
      });
      if (out.length >= maxHighlights) {
        break;
      }
    }
    return out.length > 0 ? out : this.fallbackHighlights(limited, maxHighlights);
  }
}


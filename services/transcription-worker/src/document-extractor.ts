import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import pdfParse from 'pdf-parse';
import { TranscriptResult } from './transcription-provider';

const DOCUMENT_MIME_TYPES = new Set([
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);

export class DocumentExtractionError extends Error {
  constructor(
    public readonly code: 'DOCUMENT_EXTRACTION_EMPTY_TEXT' | 'DOCUMENT_EXTRACTION_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'DocumentExtractionError';
  }
}

function isDocumentExtension(storagePath: string): boolean {
  const ext = path.extname(storagePath).toLowerCase();
  return ext === '.txt' || ext === '.pdf' || ext === '.pptx';
}

export function isDocumentInput(storagePath: string, mimeType?: string): boolean {
  const mime = String(mimeType || '').toLowerCase();
  return DOCUMENT_MIME_TYPES.has(mime) || isDocumentExtension(storagePath);
}

export async function extractDocumentTranscript(
  artifactsDir: string,
  storagePath: string,
  language: string
): Promise<TranscriptResult> {
  try {
    const absolutePath = path.join(artifactsDir, storagePath);
    const ext = path.extname(storagePath).toLowerCase();
    const payload = await readFile(absolutePath);

    let text = '';
    if (ext === '.txt') {
      text = payload.toString('utf-8');
    } else if (ext === '.pdf') {
      const parsed = await pdfParse(payload);
      text = parsed.text || '';
    } else if (ext === '.pptx') {
      text = await extractPptxText(payload);
    } else {
      // Fallback: best-effort as UTF-8 text
      text = payload.toString('utf-8');
    }

    const normalized = normalizeText(text);
    if (!normalized) {
      throw new DocumentExtractionError(
        'DOCUMENT_EXTRACTION_EMPTY_TEXT',
        `No extractable text found in document ${storagePath}`
      );
    }

    return {
      text: normalized,
      segments: [{ start: 0, end: 1, text: normalized }],
      duration: 1,
      language: language || 'ru'
    };
  } catch (error) {
    if (error instanceof DocumentExtractionError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new DocumentExtractionError('DOCUMENT_EXTRACTION_FAILED', message);
  }
}

async function extractPptxText(payload: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(payload);
  const slideXmlNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const aNum = Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      const bNum = Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      return aNum - bNum;
    });

  const chunks: string[] = [];
  for (const name of slideXmlNames) {
    const xml = await zip.file(name)?.async('text');
    if (!xml) continue;
    const texts = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi))
      .map((m) => decodeXmlEntities(m[1] || '').trim())
      .filter(Boolean);
    if (texts.length > 0) {
      chunks.push(texts.join(' '));
    }
  }
  return chunks.join('\n');
}

function normalizeText(text: string): string {
  return text.replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

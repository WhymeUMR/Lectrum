"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentExtractionError = void 0;
exports.isDocumentInput = isDocumentInput;
exports.extractDocumentTranscript = extractDocumentTranscript;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const jszip_1 = __importDefault(require("jszip"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const DOCUMENT_MIME_TYPES = new Set([
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);
class DocumentExtractionError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'DocumentExtractionError';
    }
}
exports.DocumentExtractionError = DocumentExtractionError;
function isDocumentExtension(storagePath) {
    const ext = node_path_1.default.extname(storagePath).toLowerCase();
    return ext === '.txt' || ext === '.pdf' || ext === '.pptx';
}
function isDocumentInput(storagePath, mimeType) {
    const mime = String(mimeType || '').toLowerCase();
    return DOCUMENT_MIME_TYPES.has(mime) || isDocumentExtension(storagePath);
}
async function extractDocumentTranscript(artifactsDir, storagePath, language) {
    try {
        const absolutePath = node_path_1.default.join(artifactsDir, storagePath);
        const ext = node_path_1.default.extname(storagePath).toLowerCase();
        const payload = await (0, promises_1.readFile)(absolutePath);
        let text = '';
        if (ext === '.txt') {
            text = payload.toString('utf-8');
        }
        else if (ext === '.pdf') {
            const parsed = await (0, pdf_parse_1.default)(payload);
            text = parsed.text || '';
        }
        else if (ext === '.pptx') {
            text = await extractPptxText(payload);
        }
        else {
            // Fallback: best-effort as UTF-8 text
            text = payload.toString('utf-8');
        }
        const normalized = normalizeText(text);
        if (!normalized) {
            throw new DocumentExtractionError('DOCUMENT_EXTRACTION_EMPTY_TEXT', `No extractable text found in document ${storagePath}`);
        }
        return {
            text: normalized,
            segments: [{ start: 0, end: 1, text: normalized }],
            duration: 1,
            language: language || 'ru'
        };
    }
    catch (error) {
        if (error instanceof DocumentExtractionError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new DocumentExtractionError('DOCUMENT_EXTRACTION_FAILED', message);
    }
}
async function extractPptxText(payload) {
    const zip = await jszip_1.default.loadAsync(payload);
    const slideXmlNames = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => {
        const aNum = Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
        const bNum = Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
        return aNum - bNum;
    });
    const chunks = [];
    for (const name of slideXmlNames) {
        const xml = await zip.file(name)?.async('text');
        if (!xml)
            continue;
        const texts = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi))
            .map((m) => decodeXmlEntities(m[1] || '').trim())
            .filter(Boolean);
        if (texts.length > 0) {
            chunks.push(texts.join(' '));
        }
    }
    return chunks.join('\n');
}
function normalizeText(text) {
    return text.replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
}
function decodeXmlEntities(input) {
    return input
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}
//# sourceMappingURL=document-extractor.js.map
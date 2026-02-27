"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummaryGenerationError = void 0;
exports.generateSummary = generateSummary;
const zod_1 = require("zod");
const InsightKindSchema = zod_1.z.enum(['formula', 'code', 'literature', 'concept', 'example']);
const SummarySchema = zod_1.z.object({
    title: zod_1.z.string().min(3),
    duration: zod_1.z.string().min(4),
    smart_reading_time: zod_1.z.string().min(3),
    executive_summary: zod_1.z.string().min(20),
    top_takeaways: zod_1.z.array(zod_1.z.string().min(8)).min(3).max(7),
    material_insights: zod_1.z.array(zod_1.z.object({
        kind: InsightKindSchema,
        title: zod_1.z.string().min(3),
        importance: zod_1.z.string().min(8),
        application: zod_1.z.string().min(3).optional(),
        snippet: zod_1.z.string().min(3).optional()
    })).min(3).max(10),
    entities: zod_1.z.object({
        people: zod_1.z.array(zod_1.z.string().min(1)).max(30),
        concepts: zod_1.z.array(zod_1.z.string().min(1)).max(30)
    })
});
class SummaryGenerationError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'SummaryGenerationError';
    }
}
exports.SummaryGenerationError = SummaryGenerationError;
async function generateSummary(input, options) {
    if (!options.apiKey) {
        throw new SummaryGenerationError('SUMMARY_AI_UNAVAILABLE', 'OPENAI_API_KEY is required for summary generation');
    }
    const durationSec = Math.max(1, Math.floor(Number(input.durationSec ?? 0)));
    const timeoutMs = Math.max(30_000, Math.floor(Number(options.timeoutMs ?? 180_000)));
    const prompt = [
        'Сделай конспект лекции в строгом JSON-формате (без markdown и без пояснений).',
        'JSON-схема:',
        '{',
        '  "title": "...",',
        '  "duration": "HH:MM:SS",',
        '  "smart_reading_time": "3 min",',
        '  "executive_summary": "...",',
        '  "top_takeaways": ["...", "...", "..."],',
        '  "material_insights": [{"kind":"formula|code|literature|concept|example","title":"...","importance":"...","application":"...","snippet":"..."}],',
        '  "entities": {"people": ["..."], "concepts": ["..."]}',
        '}',
        'Ключевые требования:',
        '- Пиши по-русски.',
        '- top_takeaways: 3-5 содержательных тезисов.',
        '- material_insights: 4-8 пунктов, без таймлайна.',
        '- Если математика: выделяй формулы/методы и применение.',
        '- Если программирование: выделяй функции/алгоритмы и короткие сниппеты.',
        '- Если литература/гуманитарное: краткий пересказ и смысловые идеи.',
        '- Для каждого пункта укажи, почему это важно (importance).',
        '- Пиши живым, связным и понятным языком, как заметки для человека.',
        '- Не копируй сырой транскрипт длинными кусками, переформулируй по смыслу.',
        `Исходный заголовок: ${input.title}`,
        `Длительность (сек): ${durationSec}`,
        'Транскрипт:',
        input.transcriptText
    ].join('\n');
    const parsed = await requestSummaryFromLlm(options.apiKey, prompt, options, timeoutMs);
    const normalized = normalizeSummaryPayload(parsed, {
        sourceTitle: input.title,
        transcriptText: input.transcriptText,
        durationSec
    });
    try {
        return SummarySchema.parse(normalized);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new SummaryGenerationError('SUMMARY_AI_INVALID_RESPONSE', message);
    }
}
async function requestSummaryFromLlm(apiKey, prompt, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${options.baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: options.model ?? 'gpt-4.1-mini',
                temperature: 0.2,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: 'Ты редактор учебных материалов. Возвращай только валидный JSON по схеме пользователя.'
                    },
                    { role: 'user', content: prompt }
                ]
            }),
            signal: controller.signal
        });
        if (!response.ok) {
            throw new SummaryGenerationError('SUMMARY_AI_HTTP_ERROR', `LLM HTTP ${response.status}`);
        }
        const data = (await response.json());
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            throw new SummaryGenerationError('SUMMARY_AI_INVALID_RESPONSE', 'Empty AI summary response');
        }
        return parseJsonLoose(content);
    }
    catch (error) {
        if (error instanceof SummaryGenerationError)
            throw error;
        if (error instanceof Error && error.name === 'AbortError') {
            throw new SummaryGenerationError('SUMMARY_AI_HTTP_ERROR', `LLM request timeout after ${timeoutMs}ms`);
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new SummaryGenerationError('SUMMARY_AI_HTTP_ERROR', message);
    }
    finally {
        clearTimeout(timer);
    }
}
function parseJsonLoose(content) {
    try {
        return JSON.parse(content);
    }
    catch {
        const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced?.[1]) {
            try {
                return JSON.parse(fenced[1].trim());
            }
            catch {
                // noop
            }
        }
        const start = content.indexOf('{');
        const end = content.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
            return JSON.parse(content.slice(start, end + 1));
        }
        throw new SummaryGenerationError('SUMMARY_AI_INVALID_RESPONSE', 'AI summary response is not valid JSON');
    }
}
function normalizeSummaryPayload(raw, defaults) {
    const obj = (raw && typeof raw === 'object' ? raw : {});
    const sentences = splitSentences(defaults.transcriptText);
    const takeaways = normalizeStringArray(obj.top_takeaways ?? obj.topTakeaways ?? obj.takeaways ?? obj.key_points);
    const people = normalizeStringArray(obj.entities?.people ?? obj.people);
    const concepts = normalizeStringArray(obj.entities?.concepts ?? obj.concepts);
    const rawInsights = Array.isArray(obj.material_insights)
        ? obj.material_insights
        : Array.isArray(obj.insights)
            ? obj.insights
            : Array.isArray(obj.timeline_links)
                ? obj.timeline_links
                : [];
    const materialInsights = normalizeInsights(rawInsights, sentences);
    return {
        title: toText(obj.title ?? obj.source_metadata?.title, defaults.sourceTitle),
        duration: toText(obj.duration ?? obj.source_metadata?.duration, formatDuration(defaults.durationSec)),
        smart_reading_time: toText(obj.smart_reading_time ?? obj.smartReadingTime ?? obj.source_metadata?.reading_time, estimateSmartReadingTime(defaults.durationSec)),
        executive_summary: toText(obj.executive_summary ?? obj.executiveSummary ?? obj.summary ?? obj.one_sentence_pitch, buildExecutiveSummary(sentences)),
        top_takeaways: (takeaways.length >= 3 ? takeaways : buildTakeaways(sentences)).slice(0, 7),
        material_insights: materialInsights,
        entities: {
            people: people.slice(0, 30),
            concepts: (concepts.length > 0 ? concepts : extractConcepts(sentences)).slice(0, 30)
        }
    };
}
function normalizeInsights(raw, sentences) {
    const normalized = [];
    for (const item of raw) {
        if (typeof item === 'string') {
            const text = item.trim();
            if (!text)
                continue;
            const note = toNoteSentence(text);
            normalized.push({
                kind: detectKind(note),
                title: deriveTitle(note),
                importance: note
            });
            continue;
        }
        if (!item || typeof item !== 'object')
            continue;
        const row = item;
        const title = toText(row.title ?? row.topic ?? row.text, '');
        const importance = toNoteSentence(toText(row.importance ?? row.summary ?? row.reason ?? row.text, ''));
        if (!title && !importance)
            continue;
        const application = toText(row.application ?? row.usage ?? row.example, '');
        const snippet = toText(row.snippet ?? row.code ?? row.formula, '');
        const kind = detectKind(toText(row.kind, `${detectKind(`${title} ${importance}`)}`));
        normalized.push({
            kind,
            title: deriveTitle((title || importance).slice(0, 160)),
            importance: toNoteSentence((importance || title).slice(0, 320)),
            application: application || undefined,
            snippet: kind === 'formula' || kind === 'code' ? (snippet || undefined) : undefined
        });
    }
    if (normalized.length >= 3)
        return normalized.slice(0, 10);
    return buildInsightsFromText(sentences).slice(0, 10);
}
function buildInsightsFromText(sentences) {
    const picked = [
        sentences[0] ?? '',
        sentences[Math.floor(sentences.length * 0.3)] ?? '',
        sentences[Math.floor(sentences.length * 0.6)] ?? '',
        sentences[Math.floor(sentences.length * 0.85)] ?? ''
    ].map((s) => s.trim()).filter(Boolean);
    const out = picked.map((s, idx) => ({
        kind: detectKind(s),
        title: deriveTitle(s),
        importance: toNoteSentence(s.slice(0, 280)),
        application: idx % 2 === 0 ? 'Использовать как опорную идею при разборе темы.' : undefined,
        snippet: maybeSnippet(s)
    }));
    while (out.length < 3) {
        out.push({
            kind: 'concept',
            title: `Ключевая идея ${out.length + 1}`,
            importance: 'Важная идея лекции, требующая закрепления через практику.',
            application: 'Сформулировать своими словами и привести пример применения.',
            snippet: undefined
        });
    }
    return out;
}
function maybeSnippet(text) {
    const math = text.match(/[A-Za-zА-Яа-я]?\s*=\s*[^,.!?]{3,40}/);
    if (math)
        return math[0];
    const code = text.match(/\b(function|const|let|class|if|for|while|return)\b[^.]{0,100}/i);
    if (code)
        return code[0].trim();
    return undefined;
}
function detectKind(text) {
    const t = text.toLowerCase();
    if (/[=+\-*/^]/.test(t) || /формул|теорем|доказат|интеграл|производн/.test(t))
        return 'formula';
    if (/function|const|let|class|typescript|javascript|python|java|алгоритм|функц/.test(t))
        return 'code';
    if (/геро|сюжет|роман|поэм|стих|персонаж|автор|литератур/.test(t))
        return 'literature';
    if (/пример|кейс|сценар/.test(t))
        return 'example';
    return 'concept';
}
function splitSentences(text) {
    return text
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 20);
}
function buildExecutiveSummary(sentences) {
    if (sentences.length === 0) {
        return 'Лекция раскрывает ключевые идеи материала и их практическую ценность.';
    }
    const first = sentences[0] ?? '';
    const middle = sentences[Math.floor(sentences.length / 2)] ?? '';
    return `${first} ${middle}`.slice(0, 420).trim();
}
function buildTakeaways(sentences) {
    if (sentences.length === 0) {
        return [
            'Ключевая идея материала сформулирована и объяснена на практических примерах.',
            'Важные концепты связаны между собой и дают цельную картину темы.',
            'Итог лекции можно применить в учебной или рабочей практике.'
        ];
    }
    const points = [
        sentences[0],
        sentences[Math.floor(sentences.length / 2)] ?? sentences[0],
        sentences[sentences.length - 1] ?? sentences[0]
    ].map((s) => s.slice(0, 220).trim()).filter(Boolean);
    while (points.length < 3)
        points.push(points[points.length - 1] || 'Ключевой тезис лекции.');
    return Array.from(new Set(points));
}
function estimateSmartReadingTime(durationSec) {
    const minutes = Math.max(3, Math.min(12, Math.ceil(durationSec / 2400)));
    return `${minutes} min`;
}
function extractConcepts(sentences) {
    const words = (sentences.join(' ').match(/[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-]{4,}/g) ?? []);
    const out = [];
    for (const w of words) {
        if (!out.includes(w))
            out.push(w);
        if (out.length >= 12)
            break;
    }
    return out;
}
function normalizeStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.map((v) => toText(v, '')).map((v) => v.trim()).filter((v) => v.length > 0);
}
function formatDuration(durationSec) {
    const h = Math.floor(durationSec / 3600).toString().padStart(2, '0');
    const m = Math.floor((durationSec % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(durationSec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}
function toText(value, fallback) {
    if (typeof value === 'string' && value.trim())
        return value.trim();
    return fallback;
}
function toNoteSentence(text) {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned)
        return '';
    const normalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}
function deriveTitle(text) {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned)
        return 'Ключевая идея';
    const words = cleaned.split(' ').slice(0, 7).join(' ');
    const title = words.charAt(0).toUpperCase() + words.slice(1);
    return title.length > 80 ? `${title.slice(0, 80)}...` : title;
}
//# sourceMappingURL=summary-generation.js.map
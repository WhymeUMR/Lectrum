"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateFlashcardDeck = generateFlashcardDeck;
const contracts_1 = require("@lecture/contracts");
function buildSystemPrompt(attempt) {
    const strictSuffix = attempt === 'retry'
        ? 'Исправь предыдущие ошибки: строго следуй схеме, без лишних полей.'
        : 'Следуй схеме и не добавляй лишних полей.';
    return [
        'Ты генератор учебных флешкарт.',
        'Верни только JSON-объект без markdown.',
        'JSON должен соответствовать схеме: {schemaVersion, lectureId, generatedAt, cards[]}.',
        strictSuffix
    ].join(' ');
}
function buildUserPrompt(payload) {
    return [
        `lectureId=${payload.lectureId}`,
        `maxCards=${payload.maxCards}`,
        'Сгенерируй карточки по транскрипту ниже:',
        payload.transcriptText
    ].join('\n');
}
function buildFallbackDeck(payload) {
    const pieces = payload.transcriptText
        .split(/[\n.!?]+/g)
        .map((part) => part.trim())
        .filter((part) => part.length >= 20);
    const cards = (pieces.length > 0 ? pieces : [payload.transcriptText])
        .slice(0, payload.maxCards)
        .map((piece) => ({
        question: `Что важно понять из фрагмента: "${piece.slice(0, 80)}"?`,
        answer: piece,
        hints: piece.split(/\s+/).slice(0, 2),
        tags: ['lecture'],
        difficulty: 'medium'
    }));
    return contracts_1.FlashcardDeckSchema.parse({
        schemaVersion: '1.0',
        lectureId: payload.lectureId,
        generatedAt: new Date().toISOString(),
        cards
    });
}
function normalizeCard(candidate) {
    return {
        question: candidate.question ?? candidate.front ?? candidate.q,
        answer: candidate.answer ?? candidate.back ?? candidate.a,
        hints: Array.isArray(candidate.hints) ? candidate.hints : [],
        tags: Array.isArray(candidate.tags) ? candidate.tags : ['lecture'],
        difficulty: candidate.difficulty ?? 'medium'
    };
}
function normalizeDeckShape(candidate, lectureId) {
    const base = typeof candidate === 'object' && candidate !== null ? candidate : {};
    const cardsRaw = typeof base === 'object' &&
        base !== null &&
        'cards' in base &&
        Array.isArray(base.cards)
        ? (base.cards ?? [])
        : Array.isArray(candidate)
            ? candidate
            : [];
    return {
        schemaVersion: '1.0',
        lectureId,
        generatedAt: typeof base === 'object' &&
            base !== null &&
            'generatedAt' in base &&
            typeof base.generatedAt === 'string'
            ? base.generatedAt
            : new Date().toISOString(),
        cards: cardsRaw
            .filter((card) => typeof card === 'object' && card !== null)
            .map((card) => normalizeCard(card))
    };
}
function extractJsonCandidate(raw) {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) {
        throw new Error('Could not locate JSON object in model output');
    }
    return raw.slice(first, last + 1);
}
function parseDeckStrict(raw) {
    return contracts_1.FlashcardDeckSchema.parse(JSON.parse(raw));
}
function buildLocalDeckJson(payload) {
    return JSON.stringify(buildFallbackDeck(payload));
}
async function callOpenAIJson(payload, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
        const response = await fetch(`${options.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${options.apiKey}`
            },
            body: JSON.stringify({
                model: options.model,
                temperature: 0.2,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: buildSystemPrompt(options.attempt) },
                    { role: 'user', content: buildUserPrompt(payload) }
                ]
            }),
            signal: controller.signal
        });
        if (!response.ok) {
            throw new Error(`OpenAI HTTP ${response.status}`);
        }
        const data = (await response.json());
        const content = data.choices?.[0]?.message?.content;
        if (!content || typeof content !== 'string') {
            throw new Error('OpenAI response has no string content');
        }
        return content;
    }
    finally {
        clearTimeout(timer);
    }
}
async function generateRaw(payload, options, attempt) {
    if (options.generator) {
        return options.generator({
            payload,
            systemPrompt: buildSystemPrompt(attempt),
            userPrompt: buildUserPrompt(payload),
            attempt
        });
    }
    if (options.apiKey) {
        return callOpenAIJson(payload, {
            apiKey: options.apiKey,
            model: options.model ?? 'gpt-4.1-mini',
            baseUrl: options.baseUrl ?? 'https://api.openai.com/v1',
            attempt,
            timeoutMs: options.timeoutMs ?? 20000
        });
    }
    return buildLocalDeckJson(payload);
}
async function generateFlashcardDeck(payload, options = {}) {
    const primaryRaw = await generateRaw(payload, options, 'primary');
    try {
        const deck = parseDeckStrict(primaryRaw);
        return {
            deck,
            report: { path: 'primary', primaryValid: true, finalValid: true, attempts: 1 }
        };
    }
    catch {
        const retryRaw = await generateRaw(payload, options, 'retry');
        try {
            const deck = parseDeckStrict(retryRaw);
            return {
                deck,
                report: { path: 'retry', primaryValid: false, finalValid: true, attempts: 2 }
            };
        }
        catch {
            try {
                const repaired = extractJsonCandidate(retryRaw);
                const normalized = normalizeDeckShape(JSON.parse(repaired), payload.lectureId);
                const deck = contracts_1.FlashcardDeckSchema.parse(normalized);
                return {
                    deck,
                    report: { path: 'repair', primaryValid: false, finalValid: true, attempts: 2 }
                };
            }
            catch {
                const deck = buildFallbackDeck(payload);
                return {
                    deck,
                    report: { path: 'fallback', primaryValid: false, finalValid: true, attempts: 2 }
                };
            }
        }
    }
}
//# sourceMappingURL=flashcard-generation.js.map
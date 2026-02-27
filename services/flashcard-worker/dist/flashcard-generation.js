"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateFlashcardDeck = generateFlashcardDeck;
const contracts_1 = require("@lecture/contracts");
function fitDeckCardCount(deck, requested, transcriptText) {
    const target = Math.max(1, Math.min(10, requested));
    const cards = [...deck.cards].slice(0, target);
    while (cards.length < target) {
        const idx = cards.length + 1;
        cards.push({
            sectionTitle: `Дополнительный раздел ${idx}`,
            description: transcriptText.slice(0, 260),
            keyInfo: transcriptText.slice(0, 180),
            imagePrompt: `Иллюстрация к теме лекции, карточка ${idx}`
        });
    }
    return { ...deck, cards };
}
function buildSystemPrompt(attempt) {
    const strictSuffix = attempt === 'retry'
        ? 'Исправь предыдущие ошибки: строго следуй схеме, без лишних полей.'
        : 'Следуй схеме и не добавляй лишних полей.';
    return [
        'Ты генератор карточек по материалу лекции.',
        'Верни только JSON-объект без markdown.',
        'JSON должен соответствовать схеме: {schemaVersion, lectureId, generatedAt, cards[]}.',
        'Каждая карточка: {sectionTitle, description, keyInfo, imagePrompt}.',
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
    const ensureMin = (text, min) => {
        const safe = text.trim();
        if (safe.length >= min)
            return safe;
        return `${safe} ${safe}`.trim().slice(0, Math.max(min, safe.length));
    };
    const pieces = payload.transcriptText
        .split(/[\n.!?]+/g)
        .map((part) => part.trim())
        .filter((part) => part.length >= 20);
    const cards = (pieces.length > 0 ? pieces : [payload.transcriptText])
        .slice(0, payload.maxCards)
        .map((piece, index) => ({
        sectionTitle: `Раздел ${index + 1}`,
        description: ensureMin(piece.slice(0, 260), 10),
        keyInfo: ensureMin(piece.slice(0, 180), 10),
        imagePrompt: ensureMin(`Иллюстрация к теме: ${piece.slice(0, 80)}`, 3)
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
        sectionTitle: candidate.sectionTitle ?? candidate.title ?? candidate.topic,
        description: candidate.description ?? candidate.summary ?? candidate.details,
        keyInfo: candidate.keyInfo ?? candidate.keyInformation ?? candidate.key_point,
        imagePrompt: candidate.imagePrompt ?? candidate.imageDescription ?? candidate.image
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
            deck: fitDeckCardCount(deck, payload.maxCards, payload.transcriptText),
            report: { path: 'primary', primaryValid: true, finalValid: true, attempts: 1 }
        };
    }
    catch {
        const retryRaw = await generateRaw(payload, options, 'retry');
        try {
            const deck = parseDeckStrict(retryRaw);
            return {
                deck: fitDeckCardCount(deck, payload.maxCards, payload.transcriptText),
                report: { path: 'retry', primaryValid: false, finalValid: true, attempts: 2 }
            };
        }
        catch {
            try {
                const repaired = extractJsonCandidate(retryRaw);
                const normalized = normalizeDeckShape(JSON.parse(repaired), payload.lectureId);
                const deck = contracts_1.FlashcardDeckSchema.parse(normalized);
                return {
                    deck: fitDeckCardCount(deck, payload.maxCards, payload.transcriptText),
                    report: { path: 'repair', primaryValid: false, finalValid: true, attempts: 2 }
                };
            }
            catch {
                const deck = buildFallbackDeck(payload);
                return {
                    deck: fitDeckCardCount(deck, payload.maxCards, payload.transcriptText),
                    report: { path: 'fallback', primaryValid: false, finalValid: true, attempts: 2 }
                };
            }
        }
    }
}
//# sourceMappingURL=flashcard-generation.js.map
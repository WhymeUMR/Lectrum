"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlashcardGenerationError = void 0;
exports.generateFlashcardDeck = generateFlashcardDeck;
const contracts_1 = require("@lecture/contracts");
class FlashcardGenerationError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'FlashcardGenerationError';
    }
}
exports.FlashcardGenerationError = FlashcardGenerationError;
function normalizeWhitespace(value) {
    return value.replace(/\s+/g, ' ').trim();
}
function ensureKeyInfoPrefix(value, language) {
    const normalized = normalizeWhitespace(value);
    const ruPrefix = 'Полезно запомнить: ';
    const enPrefix = 'Memorable detail: ';
    if (language === 'ru') {
        return /^полезно запомнить\s*:/i.test(normalized) ? normalized : `${ruPrefix}${normalized}`;
    }
    return /^memorable detail\s*:/i.test(normalized) ? normalized : `${enPrefix}${normalized}`;
}
function stripKeyInfoPrefix(value) {
    return normalizeWhitespace(value)
        .replace(/^полезно запомнить\s*:\s*/i, '')
        .replace(/^memorable detail\s*:\s*/i, '')
        .trim();
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
        throw new FlashcardGenerationError('FLASHCARD_AI_INVALID_RESPONSE', 'Could not locate JSON object in model output');
    }
    return raw.slice(first, last + 1);
}
function inferTargetLanguage(transcriptText) {
    const text = String(transcriptText || '');
    const cyr = (text.match(/[А-Яа-яЁё]/g) || []).length;
    const lat = (text.match(/[A-Za-z]/g) || []).length;
    return cyr >= lat ? 'ru' : 'en';
}
function buildSystemPrompt(attempt, targetLanguage) {
    const langRule = targetLanguage === 'ru'
        ? 'Пиши только по-русски. Никакого английского в полях карточек.'
        : 'Write only in English. Do not mix Russian words.';
    const strictSuffix = attempt === 'retry'
        ? `Исправь ошибки предыдущей попытки и верни полностью корректный JSON. ${langRule}`
        : 'Сразу верни полностью корректный JSON.';
    return [
        'Ты методист и редактор учебных карточек.',
        'Сделай осмысленные карточки по лекции: без дословных цитат, без обрывков, только сжатые переформулировки смысла.',
        'Каждая карточка должна раскрывать отдельный смысловой блок и не повторять другие карточки.',
        'В keyInfo дай одну яркую и запоминающуюся деталь по теме (не выдумывать, только из исходного текста).',
        'Если в тексте есть сравнение или метафора, не выдавай ее как буквальный факт.',
        'Если в тексте есть исправления терминов или оговорки, учитывай финальную корректную формулировку.',
        langRule,
        'Верни только JSON-объект без markdown.',
        'Схема строго: {schemaVersion, lectureId, generatedAt, cards[]}.',
        'Карточка строго: {sectionTitle, description, keyInfo, imagePrompt}.',
        'description: 1-3 предложения (40-260 символов), keyInfo: 1 предложение (25-180 символов) в формате "Полезно запомнить: ..."/"Memorable detail: ...".',
        strictSuffix
    ].join(' ');
}
function buildUserPrompt(payload, targetLanguage) {
    const langHint = targetLanguage === 'ru' ? 'ru' : 'en';
    return [
        `lectureId=${payload.lectureId}`,
        `maxCards=${payload.maxCards}`,
        `outputLanguage=${langHint}`,
        'Сгенерируй карточки по транскрипту ниже:',
        payload.transcriptText
    ].join('\n');
}
function assertDeckQuality(deck, payload, targetLanguage) {
    const expectedCount = Math.max(1, Math.min(10, payload.maxCards));
    if (deck.cards.length !== expectedCount) {
        throw new FlashcardGenerationError('FLASHCARD_AI_INVALID_RESPONSE', `Expected ${expectedCount} cards, got ${deck.cards.length}`);
    }
    const titles = new Set();
    const normalizedTranscript = normalizeWhitespace(payload.transcriptText.toLowerCase());
    for (const card of deck.cards) {
        const sectionTitle = normalizeWhitespace(card.sectionTitle);
        const description = normalizeWhitespace(card.description);
        const keyInfo = ensureKeyInfoPrefix(card.keyInfo, targetLanguage);
        if (!sectionTitle || !description || !keyInfo) {
            throw new FlashcardGenerationError('FLASHCARD_AI_INVALID_RESPONSE', 'Card contains empty fields');
        }
        const titleKey = sectionTitle.toLowerCase();
        if (titles.has(titleKey)) {
            throw new FlashcardGenerationError('FLASHCARD_AI_INVALID_RESPONSE', 'Duplicate sectionTitle detected');
        }
        titles.add(titleKey);
        if (description.length < 40 || keyInfo.length < 25) {
            throw new FlashcardGenerationError('FLASHCARD_AI_INVALID_RESPONSE', 'Card summary is too short');
        }
        const normalizedKeyInfo = normalizeWhitespace(stripKeyInfoPrefix(keyInfo).toLowerCase());
        if (normalizedKeyInfo.length >= 50 && normalizedTranscript.includes(normalizedKeyInfo)) {
            throw new FlashcardGenerationError('FLASHCARD_AI_INVALID_RESPONSE', 'KeyInfo looks like raw transcript excerpt instead of summary');
        }
        if (!isTextLanguageValid(`${sectionTitle} ${description} ${keyInfo}`, targetLanguage)) {
            throw new FlashcardGenerationError('FLASHCARD_AI_INVALID_RESPONSE', `Card language does not match target language: ${targetLanguage}`);
        }
    }
    return {
        ...deck,
        cards: deck.cards.map((card) => ({
            sectionTitle: normalizeWhitespace(card.sectionTitle).slice(0, 90),
            description: normalizeWhitespace(card.description).slice(0, 260),
            keyInfo: ensureKeyInfoPrefix(card.keyInfo, targetLanguage).slice(0, 180),
            imagePrompt: normalizeWhitespace(card.imagePrompt).slice(0, 200)
        }))
    };
}
function isTextLanguageValid(text, language) {
    const value = String(text || '');
    const cyr = (value.match(/[А-Яа-яЁё]/g) || []).length;
    const lat = (value.match(/[A-Za-z]/g) || []).length;
    if (language === 'ru') {
        return cyr >= Math.max(12, lat * 2);
    }
    return lat >= Math.max(12, cyr * 2);
}
async function callOpenAIJson(payload, options, targetLanguage) {
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
                    { role: 'system', content: buildSystemPrompt(options.attempt, targetLanguage) },
                    { role: 'user', content: buildUserPrompt(payload, targetLanguage) }
                ]
            }),
            signal: controller.signal
        });
        if (!response.ok) {
            throw new FlashcardGenerationError('FLASHCARD_AI_HTTP_ERROR', `OpenAI HTTP ${response.status}`);
        }
        const data = (await response.json());
        const content = data.choices?.[0]?.message?.content;
        if (!content || typeof content !== 'string') {
            throw new FlashcardGenerationError('FLASHCARD_AI_INVALID_RESPONSE', 'OpenAI response has no string content');
        }
        return content;
    }
    finally {
        clearTimeout(timer);
    }
}
async function generateRaw(payload, options, attempt, targetLanguage) {
    if (options.generator) {
        return options.generator({
            payload,
            systemPrompt: buildSystemPrompt(attempt, targetLanguage),
            userPrompt: buildUserPrompt(payload, targetLanguage),
            attempt
        });
    }
    if (!options.apiKey) {
        throw new FlashcardGenerationError('FLASHCARD_AI_UNAVAILABLE', 'OPENAI_API_KEY is required for flashcards generation');
    }
    return callOpenAIJson(payload, {
        apiKey: options.apiKey,
        model: options.model ?? 'gpt-4.1-mini',
        baseUrl: options.baseUrl ?? 'https://api.openai.com/v1',
        attempt,
        timeoutMs: options.timeoutMs ?? 120000
    }, targetLanguage);
}
function parseDeck(raw, lectureId) {
    try {
        return contracts_1.FlashcardDeckSchema.parse(JSON.parse(raw));
    }
    catch {
        const repaired = extractJsonCandidate(raw);
        const normalized = normalizeDeckShape(JSON.parse(repaired), lectureId);
        return contracts_1.FlashcardDeckSchema.parse(normalized);
    }
}
async function generateFlashcardDeck(payload, options = {}) {
    const targetLanguage = inferTargetLanguage(payload.transcriptText);
    try {
        const primaryRaw = await generateRaw(payload, options, 'primary', targetLanguage);
        const deck = assertDeckQuality(parseDeck(primaryRaw, payload.lectureId), payload, targetLanguage);
        return {
            deck,
            report: { path: 'primary', primaryValid: true, finalValid: true, attempts: 1 }
        };
    }
    catch (firstError) {
        const retryRaw = await generateRaw(payload, options, 'retry', targetLanguage);
        try {
            const deck = assertDeckQuality(parseDeck(retryRaw, payload.lectureId), payload, targetLanguage);
            return {
                deck,
                report: { path: 'retry', primaryValid: false, finalValid: true, attempts: 2 }
            };
        }
        catch (retryError) {
            if (retryError instanceof FlashcardGenerationError) {
                throw retryError;
            }
            if (firstError instanceof FlashcardGenerationError) {
                throw firstError;
            }
            throw new FlashcardGenerationError('FLASHCARD_AI_INVALID_RESPONSE', retryError instanceof Error ? retryError.message : String(retryError));
        }
    }
}
//# sourceMappingURL=flashcard-generation.js.map
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HighlightService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@lecture/config");
let HighlightService = class HighlightService {
    constructor(env) {
        this.env = env;
    }
    async getHighlights(transcript, maxHighlights = 5) {
        const chunks = this.toChunks(transcript);
        if (chunks.length === 0) {
            return [];
        }
        if (!this.env.OPENAI_API_KEY) {
            return this.fallbackHighlights(chunks, maxHighlights);
        }
        try {
            return await this.llmHighlights(chunks, maxHighlights);
        }
        catch {
            return this.fallbackHighlights(chunks, maxHighlights);
        }
    }
    toChunks(transcript) {
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
        const chunks = [];
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
    fallbackHighlights(chunks, maxHighlights) {
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
    async llmHighlights(chunks, maxHighlights) {
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
                        content: 'Ты аналитик лекций. Определи ключевые фрагменты, которые лучше всего отражают смысл материала.'
                    },
                    { role: 'user', content: prompt }
                ]
            })
        });
        if (!res.ok) {
            throw new Error(`LLM HTTP ${res.status}`);
        }
        const data = (await res.json());
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('Empty LLM highlight response');
        }
        const parsed = JSON.parse(content);
        const chunkById = new Map(limited.map((chunk) => [chunk.id, chunk]));
        const out = [];
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
};
exports.HighlightService = HighlightService;
exports.HighlightService = HighlightService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(config_1.APP_ENV)),
    __metadata("design:paramtypes", [Object])
], HighlightService);
//# sourceMappingURL=highlight.service.js.map
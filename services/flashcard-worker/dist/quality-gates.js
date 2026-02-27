"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateQualityGates = evaluateQualityGates;
function uniqueQuestionsRatio(deck) {
    const normalized = deck.cards.map((card) => card.question.trim().toLowerCase());
    const unique = new Set(normalized);
    return unique.size / normalized.length;
}
function evaluateQualityGates(deck) {
    const reasons = [];
    const avgAnswerLength = deck.cards.reduce((sum, card) => sum + card.answer.trim().length, 0) / deck.cards.length;
    const avgQuestionLength = deck.cards.reduce((sum, card) => sum + card.question.trim().length, 0) / deck.cards.length;
    const uniqRatio = uniqueQuestionsRatio(deck);
    if (avgAnswerLength < 24) {
        reasons.push('Average answer length below 24 chars');
    }
    if (avgQuestionLength < 12) {
        reasons.push('Average question length below 12 chars');
    }
    if (uniqRatio < 0.75) {
        reasons.push('Too many duplicated questions');
    }
    const score = Math.max(0, 100 - reasons.length * 35);
    return {
        accepted: reasons.length === 0,
        reasons,
        score
    };
}
//# sourceMappingURL=quality-gates.js.map
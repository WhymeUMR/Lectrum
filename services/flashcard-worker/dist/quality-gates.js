"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateQualityGates = evaluateQualityGates;
function uniqueQuestionsRatio(deck) {
    const normalized = deck.cards.map((card) => card.sectionTitle.trim().toLowerCase());
    const unique = new Set(normalized);
    return unique.size / normalized.length;
}
function evaluateQualityGates(deck) {
    const reasons = [];
    const avgDescriptionLength = deck.cards.reduce((sum, card) => sum + card.description.trim().length, 0) / deck.cards.length;
    const avgKeyInfoLength = deck.cards.reduce((sum, card) => sum + card.keyInfo.trim().length, 0) / deck.cards.length;
    const uniqRatio = uniqueQuestionsRatio(deck);
    if (avgDescriptionLength < 30) {
        reasons.push('Average description length below 30 chars');
    }
    if (avgKeyInfoLength < 20) {
        reasons.push('Average keyInfo length below 20 chars');
    }
    if (uniqRatio < 0.7) {
        reasons.push('Too many duplicated section titles');
    }
    const score = Math.max(0, 100 - reasons.length * 35);
    return {
        accepted: reasons.length === 0,
        reasons,
        score
    };
}
//# sourceMappingURL=quality-gates.js.map
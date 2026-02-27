import { FlashcardDeck } from '@lecture/contracts';
export interface QualityGateResult {
    accepted: boolean;
    reasons: string[];
    score: number;
}
export declare function evaluateQualityGates(deck: FlashcardDeck): QualityGateResult;

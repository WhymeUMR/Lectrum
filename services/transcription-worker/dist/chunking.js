"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planChunking = planChunking;
exports.simulateChunkProcessing = simulateChunkProcessing;
function planChunking(totalChars, config) {
    const safeChars = Math.max(1, totalChars);
    const chunkCount = Math.max(1, Math.ceil(safeChars / Math.max(1, config.chunkSizeChars)));
    const waves = Math.max(1, Math.ceil(chunkCount / Math.max(1, config.maxParallelChunks)));
    return {
        chunkCount,
        waves,
        estimatedLatencyMs: waves * Math.max(1, config.chunkDelayMs)
    };
}
async function simulateChunkProcessing(plan, chunkDelayMs) {
    const delay = Math.max(1, chunkDelayMs);
    for (let wave = 0; wave < plan.waves; wave += 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
}
//# sourceMappingURL=chunking.js.map
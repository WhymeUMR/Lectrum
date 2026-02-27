export interface ChunkingConfig {
    chunkSizeChars: number;
    maxParallelChunks: number;
    chunkDelayMs: number;
}
export interface ChunkPlan {
    chunkCount: number;
    waves: number;
    estimatedLatencyMs: number;
}
export declare function planChunking(totalChars: number, config: ChunkingConfig): ChunkPlan;
export declare function simulateChunkProcessing(plan: ChunkPlan, chunkDelayMs: number): Promise<void>;

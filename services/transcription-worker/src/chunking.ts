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

export function planChunking(totalChars: number, config: ChunkingConfig): ChunkPlan {
  const safeChars = Math.max(1, totalChars);
  const chunkCount = Math.max(1, Math.ceil(safeChars / Math.max(1, config.chunkSizeChars)));
  const waves = Math.max(1, Math.ceil(chunkCount / Math.max(1, config.maxParallelChunks)));
  return {
    chunkCount,
    waves,
    estimatedLatencyMs: waves * Math.max(1, config.chunkDelayMs)
  };
}

export async function simulateChunkProcessing(plan: ChunkPlan, chunkDelayMs: number): Promise<void> {
  const delay = Math.max(1, chunkDelayMs);
  for (let wave = 0; wave < plan.waves; wave += 1) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

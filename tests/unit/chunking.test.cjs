const test = require('node:test');
const assert = require('node:assert/strict');
const {
  planChunking,
  simulateChunkProcessing
} = require('../../services/transcription-worker/dist/chunking.js');

test('planChunking computes chunk count and waves', () => {
  const plan = planChunking(3200, {
    chunkSizeChars: 800,
    maxParallelChunks: 4,
    chunkDelayMs: 25
  });

  assert.equal(plan.chunkCount, 4);
  assert.equal(plan.waves, 1);
  assert.equal(plan.estimatedLatencyMs, 25);
});

test('planChunking scales waves when parallelism is low', () => {
  const plan = planChunking(5000, {
    chunkSizeChars: 1000,
    maxParallelChunks: 2,
    chunkDelayMs: 40
  });

  assert.equal(plan.chunkCount, 5);
  assert.equal(plan.waves, 3);
  assert.equal(plan.estimatedLatencyMs, 120);
});

test('simulateChunkProcessing waits at least one wave', async () => {
  const start = Date.now();
  await simulateChunkProcessing({ chunkCount: 1, waves: 2, estimatedLatencyMs: 20 }, 10);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 15);
});

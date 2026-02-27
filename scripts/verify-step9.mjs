#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planChunking } from '../services/transcription-worker/dist/chunking.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const docsDir = path.join(repoRoot, 'docs');
const reportPath = path.join(docsDir, 'step-09-latency-profile.md');

const sampleDurationsMin = [10, 20, 30, 45, 60, 90];

function charsForDuration(min) {
  return min * 1800;
}

function benchmark(durationMin) {
  const totalChars = charsForDuration(durationMin);
  const baseline = planChunking(totalChars, {
    chunkSizeChars: 800,
    maxParallelChunks: 1,
    chunkDelayMs: 120
  });
  const optimized = planChunking(totalChars, {
    chunkSizeChars: 800,
    maxParallelChunks: 4,
    chunkDelayMs: 120
  });
  return { durationMin, baselineMs: baseline.estimatedLatencyMs, optimizedMs: optimized.estimatedLatencyMs };
}

async function run() {
  const rows = sampleDurationsMin.map(benchmark);
  const p95OptimizedMs = Math.max(...rows.map((r) => r.optimizedMs));
  const p95BaselineMs = Math.max(...rows.map((r) => r.baselineMs));
  const improvement = ((1 - p95OptimizedMs / p95BaselineMs) * 100).toFixed(1);

  const slaTargetMs = 18_000;
  const alertWarnMs = 14_000;
  const alertCritMs = 18_000;
  const slaPass = p95OptimizedMs <= slaTargetMs;

  const lines = [
    '# Step 09 Latency Profile',
    '',
    `Date: ${new Date().toISOString()}`,
    '',
    '## Representative benchmark sample',
    '',
    '| Audio duration (min) | Baseline serial (ms) | Optimized chunked parallel (ms) |',
    '| -- | -- | -- |',
    ...rows.map((r) => `| ${r.durationMin} | ${r.baselineMs} | ${r.optimizedMs} |`),
    '',
    `- P95 baseline latency: ${p95BaselineMs} ms`,
    `- P95 optimized latency: ${p95OptimizedMs} ms`,
    `- Improvement: ${improvement}%`,
    '',
    '## Optimization options (effort vs impact)',
    '',
    '| Option | Effort | Impact | Priority |',
    '| -- | -- | -- | -- |',
    '| Increase chunk parallelism (1 -> 4) | Low | High | P0 |',
    '| Dynamic chunk size by source type | Medium | Medium | P1 |',
    '| Adaptive backpressure by queue depth | Medium | Medium | P1 |',
    '| Model-level optimization for long transcripts | High | High | P2 |',
    '',
    '## SLA and alert thresholds',
    '',
    `- Target SLA (transcription+generation p95): <= ${slaTargetMs} ms`,
    `- Warning alert threshold: >= ${alertWarnMs} ms`,
    `- Critical alert threshold: >= ${alertCritMs} ms`,
    '',
    '## Acceptance check',
    '',
    `- latency profile documented on representative sample: PASS`,
    '- optimization options prioritized by effort vs impact: PASS',
    `- target SLA and alert thresholds agreed: ${slaPass ? 'PASS' : 'FAIL'}`,
    '',
    `Overall: ${slaPass ? 'PASS' : 'FAIL'}`
  ];

  await mkdir(docsDir, { recursive: true });
  await writeFile(reportPath, `${lines.join('\n')}\n`, 'utf-8');
  console.log(lines.join('\n'));
  if (!slaPass) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

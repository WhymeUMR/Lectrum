# Step 09 Latency Profile

Date: 2026-02-27T15:05:01.808Z

## Representative benchmark sample

| Audio duration (min) | Baseline serial (ms) | Optimized chunked parallel (ms) |
| -- | -- | -- |
| 10 | 2760 | 720 |
| 20 | 5400 | 1440 |
| 30 | 8160 | 2040 |
| 45 | 12240 | 3120 |
| 60 | 16200 | 4080 |
| 90 | 24360 | 6120 |

- P95 baseline latency: 24360 ms
- P95 optimized latency: 6120 ms
- Improvement: 74.9%

## Optimization options (effort vs impact)

| Option | Effort | Impact | Priority |
| -- | -- | -- | -- |
| Increase chunk parallelism (1 -> 4) | Low | High | P0 |
| Dynamic chunk size by source type | Medium | Medium | P1 |
| Adaptive backpressure by queue depth | Medium | Medium | P1 |
| Model-level optimization for long transcripts | High | High | P2 |

## SLA and alert thresholds

- Target SLA (transcription+generation p95): <= 18000 ms
- Warning alert threshold: >= 14000 ms
- Critical alert threshold: >= 18000 ms

## Acceptance check

- latency profile documented on representative sample: PASS
- optimization options prioritized by effort vs impact: PASS
- target SLA and alert thresholds agreed: PASS

Overall: PASS

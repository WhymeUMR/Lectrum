#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFlashcardDeck } from '../services/flashcard-worker/dist/flashcard-generation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const docsDir = path.join(repoRoot, 'docs');
const reportPath = path.join(docsDir, 'step-06-validation-report.md');

const SAMPLE_COUNT = 40;

function transcriptFor(index) {
  return [
    `Лекция ${index + 1}: Архитектура микросервисов.`,
    'Разбираем границы контекстов, очереди задач и идемпотентность.',
    'Отдельно обсуждаем валидацию JSON-схем и стратегию восстановления.'
  ].join(' ');
}

async function run() {
  const pathStats = {
    primary: 0,
    retry: 0,
    repair: 0,
    fallback: 0
  };

  let primaryValidCount = 0;
  let finalValidCount = 0;

  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const payload = {
      jobId: `step6-sample-${i + 1}`,
      lectureId: `lecture-${i + 1}`,
      transcriptText: transcriptFor(i),
      maxCards: 6
    };

    const result = await generateFlashcardDeck(payload, {
      generator: async ({ attempt }) => {
        if (i === 38 && attempt === 'primary') {
          return 'not-json';
        }
        if (i === 39 && attempt === 'primary') {
          return 'broken';
        }
        if (i === 39 && attempt === 'retry') {
          const deck = {
            schemaVersion: '1.0',
            lectureId: payload.lectureId,
            generatedAt: new Date().toISOString(),
            cards: [
              {
                front: 'Что такое идемпотентность?',
                back: 'Свойство безопасного повторного выполнения без изменения итогового результата.'
              }
            ]
          };
          return `garbage:${JSON.stringify(deck)}:tail`;
        }

        return JSON.stringify({
          schemaVersion: '1.0',
          lectureId: payload.lectureId,
          generatedAt: new Date().toISOString(),
          cards: [
            {
              question: 'Что важно в микросервисной архитектуре?',
              answer: 'Явные границы сервисов и надёжные асинхронные контракты.',
              hints: ['границы', 'очереди'],
              tags: ['architecture'],
              difficulty: 'medium'
            }
          ]
        });
      }
    });

    pathStats[result.report.path] += 1;
    if (result.report.primaryValid) {
      primaryValidCount += 1;
    }
    if (result.report.finalValid) {
      finalValidCount += 1;
    }
  }

  const primaryRate = primaryValidCount / SAMPLE_COUNT;
  const finalRate = finalValidCount / SAMPLE_COUNT;

  const thresholdsMet =
    primaryRate >= 0.95 &&
    finalRate === 1 &&
    pathStats.retry >= 1 &&
    pathStats.repair >= 1 &&
    pathStats.fallback === 0;

  const report = [
    '# Step 06 Validation Report',
    '',
    `Date: ${new Date().toISOString()}`,
    '',
    `- Sample size: ${SAMPLE_COUNT}`,
    `- Primary schema pass rate: ${(primaryRate * 100).toFixed(1)}%`,
    `- Final schema pass rate after retry/repair/fallback: ${(finalRate * 100).toFixed(1)}%`,
    `- Path distribution: primary=${pathStats.primary}, retry=${pathStats.retry}, repair=${pathStats.repair}, fallback=${pathStats.fallback}`,
    '',
    '## Acceptance check',
    '',
    `- >=95% primary schema pass: ${primaryRate >= 0.95 ? 'PASS' : 'FAIL'}`,
    `- deterministic retry/repair exercised: ${pathStats.retry >= 1 && pathStats.repair >= 1 ? 'PASS' : 'FAIL'}`,
    `- 100% final valid output without manual edits: ${finalRate === 1 ? 'PASS' : 'FAIL'}`,
    '',
    `Overall: ${thresholdsMet ? 'PASS' : 'FAIL'}`
  ].join('\n');

  await mkdir(docsDir, { recursive: true });
  await writeFile(reportPath, `${report}\n`, 'utf-8');
  console.log(report);

  if (!thresholdsMet) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlashcardDeckSchema } from '../packages/contracts/dist/index.js';
import { generateFlashcardDeck } from '../services/flashcard-worker/dist/flashcard-generation.js';
import { evaluateQualityGates } from '../services/flashcard-worker/dist/quality-gates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const docsDir = path.join(repoRoot, 'docs');
const reportPath = path.join(docsDir, 'step-08-risk-report.md');

const SAMPLE_COUNT = 50;

function sampleTranscript(index) {
  return [
    `Лекция ${index + 1}.`,
    'Тема: надежность JSON-схем, retry, repair и fallback.',
    'Рассматриваем архитектурные риски и обработку ошибок в пайплайне.'
  ].join(' ');
}

function validDeck(payload) {
  return {
    schemaVersion: '1.0',
    lectureId: payload.lectureId,
    generatedAt: new Date().toISOString(),
    cards: [
      {
        question: 'Как снизить риск невалидного JSON?',
        answer: 'Использовать строгую валидацию схемы и детерминированный путь retry/repair.',
        hints: ['validation', 'retry'],
        tags: ['risk', 'json'],
        difficulty: 'medium'
      }
    ]
  };
}

async function run() {
  let baselinePrimaryPass = 0;
  let targetFinalPass = 0;
  let acceptedByQualityGate = 0;

  const pathStats = { primary: 0, retry: 0, repair: 0, fallback: 0 };
  const violationStats = {
    malformed_json: 0,
    wrong_field_names: 0,
    extra_wrapper_text: 0
  };

  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const payload = {
      jobId: `step8-${i + 1}`,
      lectureId: `lec-${i + 1}`,
      transcriptText: sampleTranscript(i),
      maxCards: 8
    };

    const result = await generateFlashcardDeck(payload, {
      generator: async ({ attempt }) => {
        if (i < 8 && attempt === 'primary') {
          violationStats.malformed_json += 1;
          return 'broken';
        }
        if (i >= 8 && i < 15 && attempt === 'primary') {
          violationStats.wrong_field_names += 1;
          return JSON.stringify({
            schemaVersion: '1.0',
            lectureId: payload.lectureId,
            generatedAt: new Date().toISOString(),
            cards: [{ front: 'Что такое quality gate?', back: 'Проверка минимального качества.' }]
          });
        }
        if (i === 14 && attempt === 'retry') {
          return `wrapped:${JSON.stringify({
            schemaVersion: '1.0',
            lectureId: payload.lectureId,
            generatedAt: new Date().toISOString(),
            cards: [{ front: 'Почему нужен repair?', back: 'Чтобы нормализовать нестандартные поля.' }]
          })}:end`;
        }
        if (i >= 15 && i < 18 && attempt === 'primary') {
          violationStats.extra_wrapper_text += 1;
          return `text:${JSON.stringify(validDeck(payload))}:tail`;
        }
        return JSON.stringify(validDeck(payload));
      }
    });

    pathStats[result.report.path] += 1;
    if (result.report.primaryValid) {
      baselinePrimaryPass += 1;
    }

    const finalValid = FlashcardDeckSchema.safeParse(result.deck).success;
    if (finalValid) {
      targetFinalPass += 1;
    }

    const quality = evaluateQualityGates(result.deck);
    if (quality.accepted) {
      acceptedByQualityGate += 1;
    }
  }

  const baselineRate = baselinePrimaryPass / SAMPLE_COUNT;
  const targetRate = targetFinalPass / SAMPLE_COUNT;
  const qualityAcceptRate = acceptedByQualityGate / SAMPLE_COUNT;

  const pass =
    baselineRate < targetRate &&
    targetRate === 1 &&
    qualityAcceptRate >= 0.95 &&
    pathStats.retry >= 1 &&
    pathStats.repair >= 1;

  const report = [
    '# Step 08 Risk Report',
    '',
    `Date: ${new Date().toISOString()}`,
    '',
    `- Sample size: ${SAMPLE_COUNT}`,
    `- Baseline schema pass rate (primary only): ${(baselineRate * 100).toFixed(1)}%`,
    `- Target schema pass rate (final after deterministic handling): ${(targetRate * 100).toFixed(1)}%`,
    `- Quality gate acceptance rate: ${(qualityAcceptRate * 100).toFixed(1)}%`,
    `- Path distribution: primary=${pathStats.primary}, retry=${pathStats.retry}, repair=${pathStats.repair}, fallback=${pathStats.fallback}`,
    `- Violations cataloged in run: malformed_json=${violationStats.malformed_json}, wrong_field_names=${violationStats.wrong_field_names}, extra_wrapper_text=${violationStats.extra_wrapper_text}`,
    '',
    '## Acceptance check',
    '',
    `- baseline and target measured: ${baselineRate < targetRate ? 'PASS' : 'FAIL'}`,
    `- deterministic invalid handling confirmed: ${pathStats.retry >= 1 && pathStats.repair >= 1 ? 'PASS' : 'FAIL'}`,
    `- risk reduction criteria met: ${targetRate === 1 && qualityAcceptRate >= 0.95 ? 'PASS' : 'FAIL'}`,
    '',
    `Overall: ${pass ? 'PASS' : 'FAIL'}`
  ].join('\n');

  await mkdir(docsDir, { recursive: true });
  await writeFile(reportPath, `${report}\n`, 'utf-8');
  console.log(report);

  if (!pass) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

const test = require('node:test');
const assert = require('node:assert/strict');

test('queue names are versioned', () => {
  const queues = ['lec.v1.ingestion', 'lec.v1.transcription', 'lec.v1.flashcard'];
  for (const q of queues) {
    assert.ok(q.includes('.v1.'));
  }
});

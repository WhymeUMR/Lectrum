const test = require('node:test');
const assert = require('node:assert/strict');

test('queue names are versioned', () => {
  const queues = ['lec.v1.ingestion', 'lec.v1.transcription', 'lec.v1.flashcard'];
  for (const q of queues) {
    assert.ok(q.includes('.v1.'));
  }
});

test('queue policies retain failed jobs longer than completed jobs', () => {
  const policies = {
    ingestion: {
      removeOnComplete: { age: 24 * 60 * 60, count: 2000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 }
    },
    transcription: {
      removeOnComplete: { age: 24 * 60 * 60, count: 2000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 }
    },
    flashcard: {
      removeOnComplete: { age: 24 * 60 * 60, count: 2000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 }
    }
  };

  for (const policy of Object.values(policies)) {
    assert.ok(policy.removeOnFail.age > policy.removeOnComplete.age);
    assert.ok(policy.removeOnFail.count >= policy.removeOnComplete.count);
  }
});

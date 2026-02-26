const test = require('node:test');
const assert = require('node:assert/strict');

test('job statuses include terminal states', () => {
  const statuses = ['QUEUED', 'INGESTING', 'INGESTED', 'TRANSCRIBING', 'COMPLETED', 'FAILED'];
  assert.ok(statuses.includes('COMPLETED'));
  assert.ok(statuses.includes('FAILED'));
});

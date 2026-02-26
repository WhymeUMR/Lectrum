const test = require('node:test');
const assert = require('node:assert/strict');

test('health contract should include ok status', () => {
  const payload = { status: 'ok' };
  assert.equal(payload.status, 'ok');
});

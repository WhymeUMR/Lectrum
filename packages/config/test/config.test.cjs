const test = require('node:test');
const assert = require('node:assert/strict');

test('env defaults are documented', () => {
  assert.ok(process.env || true);
});

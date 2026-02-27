const test = require('node:test');
const assert = require('node:assert/strict');
const { generateHighlights } = require('../../services/highlight-worker/dist/highlight-generation.js');

test('generateHighlights fails fast on empty transcript', async () => {
  await assert.rejects(
    () => generateHighlights({ text: '', segments: [], duration: 0 }, {}, 5),
    (error) => {
      assert.equal(error.code, 'HIGHLIGHTS_EMPTY_TRANSCRIPT');
      return true;
    }
  );
});

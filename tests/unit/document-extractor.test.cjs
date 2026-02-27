const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { mkdtemp, writeFile } = require('node:fs/promises');
const {
  isDocumentInput,
  extractDocumentTranscript
} = require('../../services/transcription-worker/dist/document-extractor.js');

test('isDocumentInput detects supported document types', () => {
  assert.equal(isDocumentInput('raw/file.txt', 'text/plain'), true);
  assert.equal(isDocumentInput('raw/file.pdf', 'application/pdf'), true);
  assert.equal(
    isDocumentInput(
      'raw/file.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ),
    true
  );
  assert.equal(isDocumentInput('raw/file.xyz', 'application/xyz'), false);
});

test('extractDocumentTranscript extracts plain text from txt', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doc-extractor-'));
  await writeFile(path.join(dir, 'sample.txt'), 'first line\nsecond line');
  const result = await extractDocumentTranscript(dir, 'sample.txt', 'ru');
  assert.ok(result.text.includes('first line'));
  assert.ok(result.text.includes('second line'));
  assert.equal(result.language, 'ru');
  assert.ok(Array.isArray(result.segments));
});

test('extractDocumentTranscript throws for empty document text', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doc-extractor-empty-'));
  await writeFile(path.join(dir, 'empty.txt'), '   \n\t  ');
  await assert.rejects(
    () => extractDocumentTranscript(dir, 'empty.txt', 'ru'),
    (error) => {
      assert.equal(error.code, 'DOCUMENT_EXTRACTION_EMPTY_TEXT');
      return true;
    }
  );
});

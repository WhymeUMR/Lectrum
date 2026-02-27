const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { mkdtemp, writeFile } = require('node:fs/promises');
const {
  MockTranscriptionProvider,
  OpenAIWhisperTranscriptionProvider,
  TranscriptionProviderError
} = require('../../services/transcription-worker/dist/transcription-provider.js');

test('MockTranscriptionProvider returns transcript result shape', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'stt-mock-'));
  const file = path.join(dir, 'audio.txt');
  await writeFile(file, 'hello transcription mock');

  const provider = new MockTranscriptionProvider();
  const result = await provider.transcribe({
    artifactsDir: dir,
    storagePath: 'audio.txt',
    requestedLanguage: 'ru'
  });

  assert.ok(result.text.length > 0);
  assert.equal(result.language, 'ru');
  assert.ok(Array.isArray(result.segments));
});

test('MockTranscriptionProvider sanitizes binary null bytes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'stt-mock-bin-'));
  const file = path.join(dir, 'audio.bin');
  await writeFile(file, Buffer.from([0x00, 0x00, 0x61, 0x62, 0x00, 0x63]));

  const provider = new MockTranscriptionProvider();
  const result = await provider.transcribe({
    artifactsDir: dir,
    storagePath: 'audio.bin',
    requestedLanguage: 'ru'
  });

  assert.equal(result.text.includes('\u0000'), false);
  assert.ok(result.text.length > 0);
});

test('OpenAI provider maps 401 to auth error code', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response('unauthorized', {
      status: 401
    });

  const dir = await mkdtemp(path.join(os.tmpdir(), 'stt-openai-'));
  await writeFile(path.join(dir, 'audio.mp3'), 'fake');

  const provider = new OpenAIWhisperTranscriptionProvider({
    apiKey: 'x',
    baseUrl: 'https://api.openai.com/v1',
    model: 'whisper-1',
    timeoutMs: 2000
  });

  try {
    await provider.transcribe({
      artifactsDir: dir,
      storagePath: 'audio.mp3',
      requestedLanguage: 'ru'
    });
    assert.fail('Expected auth error');
  } catch (error) {
    assert.ok(error instanceof TranscriptionProviderError);
    assert.equal(error.code, 'TRANSCRIPTION_PROVIDER_AUTH');
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAI provider maps 429 to rate limit error code', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response('rate limit', {
      status: 429
    });

  const dir = await mkdtemp(path.join(os.tmpdir(), 'stt-openai-'));
  await writeFile(path.join(dir, 'audio.mp3'), 'fake');

  const provider = new OpenAIWhisperTranscriptionProvider({
    apiKey: 'x',
    baseUrl: 'https://api.openai.com/v1',
    model: 'whisper-1',
    timeoutMs: 2000
  });

  try {
    await provider.transcribe({
      artifactsDir: dir,
      storagePath: 'audio.mp3',
      requestedLanguage: 'ru'
    });
    assert.fail('Expected rate limit error');
  } catch (error) {
    assert.ok(error instanceof TranscriptionProviderError);
    assert.equal(error.code, 'TRANSCRIPTION_PROVIDER_RATE_LIMIT');
  } finally {
    global.fetch = originalFetch;
  }
});

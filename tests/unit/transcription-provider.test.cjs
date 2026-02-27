const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { mkdtemp, writeFile } = require('node:fs/promises');
const {
  MockTranscriptionProvider,
  OpenAIWhisperTranscriptionProvider,
  DeepgramTranscriptionProvider,
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

test('Deepgram provider maps response to transcript', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        metadata: { duration: 1.2 },
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: 'hello world',
                  words: [
                    { start: 0, end: 0.5, punctuated_word: 'hello' },
                    { start: 0.5, end: 1.2, punctuated_word: 'world' }
                  ]
                }
              ]
            }
          ]
        }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  const dir = await mkdtemp(path.join(os.tmpdir(), 'stt-deepgram-'));
  await writeFile(path.join(dir, 'audio.mp3'), 'fake');

  const provider = new DeepgramTranscriptionProvider({
    apiKey: 'x',
    baseUrl: 'https://api.deepgram.com/v1',
    model: 'nova-3',
    timeoutMs: 2000
  });

  try {
    const result = await provider.transcribe({
      artifactsDir: dir,
      storagePath: 'audio.mp3',
      requestedLanguage: 'en',
      mimeType: 'audio/mpeg'
    });
    assert.equal(result.text, 'hello world');
    assert.equal(result.language, 'en');
    assert.equal(result.segments.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

# Step 24 - Real STT Provider Integration

## Implemented

- Added `TranscriptionProvider` abstraction:
  - `MockTranscriptionProvider` for local/dev deterministic runs
  - `OpenAIWhisperTranscriptionProvider` for real STT (`/audio/transcriptions`)
- `transcription-worker` now uses provider abstraction instead of hardcoded placeholder.
- Added timeout + retry policy for provider calls.
- Added provider error mapping to domain job error codes:
  - `TRANSCRIPTION_PROVIDER_TIMEOUT`
  - `TRANSCRIPTION_PROVIDER_AUTH`
  - `TRANSCRIPTION_PROVIDER_RATE_LIMIT`
  - `TRANSCRIPTION_PROVIDER_BAD_REQUEST`
  - `TRANSCRIPTION_PROVIDER_UNAVAILABLE`
  - `TRANSCRIPTION_PROVIDER_ERROR`
- Transcription result persisted as structured payload (`text`, `segments`, `duration`, `language`) in transcript JSON artifact and DB field.

## Environment configuration

- `TRANSCRIPTION_PROVIDER=mock|openai`
- `TRANSCRIPTION_PROVIDER_TIMEOUT_MS=45000`
- `TRANSCRIPTION_PROVIDER_RETRY_ATTEMPTS=2`
- `TRANSCRIPTION_PROVIDER_RETRY_DELAY_MS=1000`
- `TRANSCRIPTION_OPENAI_MODEL=whisper-1`
- `OPENAI_API_KEY` (required for `openai`)
- `OPENAI_BASE_URL` (optional, defaults to `https://api.openai.com/v1`)

## Staging usage

For staging, set:

```bash
TRANSCRIPTION_PROVIDER=openai
OPENAI_API_KEY=<secret>
```

This activates real STT provider path in `transcription-worker`.

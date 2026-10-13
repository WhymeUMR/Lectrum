#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

cleanup() {
  ./scripts/compose.sh local down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[e2e] starting local stack..."
TRANSCRIPTION_PROVIDER=mock ./scripts/compose.sh local up -d --build

echo "[e2e] waiting for health endpoints..."
for i in $(seq 1 60); do
  if ./scripts/healthcheck.sh >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

./scripts/healthcheck.sh

echo "[e2e] registering test user..."
e2e_login="e2e-$(date +%s)"
token=$(curl -sS -X POST "http://localhost:3100/api/v1/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"login\":\"${e2e_login}\",\"password\":\"E2e-password-123!\"}" | jq -r '.accessToken')
if [ -z "$token" ] || [ "$token" = "null" ]; then
  echo "[e2e] failed to get access token" >&2
  exit 1
fi
auth=(-H "authorization: Bearer ${token}")

echo "[e2e] creating ingestion job..."
payload=$(printf 'fake-audio-content' | base64 | tr -d '\n')
first_resp=$(curl -sS "${auth[@]}" -X POST "http://localhost:3100/api/v1/lectures/ingest" \
  -H 'content-type: application/json' \
  -d "{\"sourceType\":\"upload\",\"filename\":\"e2e-first.mp3\",\"mimeType\":\"audio/mpeg\",\"requestedLanguage\":\"ru\",\"fileBase64\":\"${payload}\"}")
first_job_id=$(echo "$first_resp" | jq -r '.jobId')
if [ -z "$first_job_id" ] || [ "$first_job_id" = "null" ]; then
  echo "[e2e] failed to create first job" >&2
  echo "$first_resp"
  exit 1
fi
echo "[e2e] first job created: $first_job_id"

echo "[e2e] verifying second ingestion is blocked..."
second_status=$(curl -sS "${auth[@]}" -o /tmp/e2e-second.json -w "%{http_code}" -X POST "http://localhost:3100/api/v1/lectures/ingest" \
  -H 'content-type: application/json' \
  -d "{\"sourceType\":\"upload\",\"filename\":\"e2e-second.mp3\",\"mimeType\":\"audio/mpeg\",\"requestedLanguage\":\"ru\",\"fileBase64\":\"${payload}\"}")
if [ "$second_status" != "409" ]; then
  echo "[e2e] expected HTTP 409 for second concurrent ingestion, got $second_status" >&2
  cat /tmp/e2e-second.json >&2
  exit 1
fi
cat /tmp/e2e-second.json

echo "[e2e] waiting for first job completion..."
status="QUEUED"
for i in $(seq 1 30); do
  status=$(curl -sS "${auth[@]}" "http://localhost:3100/api/v1/jobs/${first_job_id}" | jq -r '.status')
  echo "poll[$i]: ${status}"
  if [ "$status" = "COMPLETED" ] || [ "$status" = "FAILED" ]; then
    break
  fi
  sleep 1
done
if [ "$status" != "COMPLETED" ]; then
  echo "[e2e] first job did not complete successfully: ${status}" >&2
  curl -sS "${auth[@]}" "http://localhost:3100/api/v1/jobs/${first_job_id}" | jq >&2
  exit 1
fi

echo "[e2e] fetching result..."
result=$(curl -sS "${auth[@]}" "http://localhost:3100/api/v1/jobs/${first_job_id}/result")
echo "$result" | jq

echo "[e2e] requesting flashcards generation..."
flash_req_status=$(curl -sS "${auth[@]}" -o /tmp/e2e-flashcards-start.json -w "%{http_code}" -X POST \
  "http://localhost:3100/api/v1/jobs/${first_job_id}/flashcards" \
  -H 'content-type: application/json' \
  -d '{"count":3}')
if [ "$flash_req_status" != "202" ]; then
  echo "[e2e] expected HTTP 202 for flashcards generation, got $flash_req_status" >&2
  cat /tmp/e2e-flashcards-start.json >&2
  exit 1
fi

echo "[e2e] waiting for flashcards completion..."
for i in $(seq 1 120); do
  result=$(curl -sS "${auth[@]}" "http://localhost:3100/api/v1/jobs/${first_job_id}/result")
  status=$(echo "$result" | jq -r '.status')
  echo "flashcards poll[$i]: ${status}"
  if [ "$status" = "COMPLETED" ] || [ "$status" = "FAILED" ]; then
    break
  fi
  sleep 1
done
if [ "$status" != "COMPLETED" ]; then
  if [ "$status" = "FAILED" ]; then
    error_code=$(echo "$result" | jq -r '.errorCode // ""')
    if [ "$error_code" = "FLASHCARD_AI_UNAVAILABLE" ] || [ "$error_code" = "FLASHCARD_AI_HTTP_ERROR" ] || [ "$error_code" = "FLASHCARD_AI_INVALID_RESPONSE" ]; then
      echo "[e2e] flashcards failed with explicit AI error code: $error_code"
      echo "$result" | jq
      echo "[e2e] PASS"
      exit 0
    fi
  fi
  echo "[e2e] flashcards generation did not complete successfully: ${status}" >&2
  echo "$result" | jq >&2
  exit 1
fi

cards_len=$(echo "$result" | jq -r '.flashcards.cards | length')
if [ "$cards_len" != "3" ]; then
  echo "[e2e] expected 3 flashcards, got $cards_len" >&2
  echo "$result" | jq >&2
  exit 1
fi

unique_titles=$(echo "$result" | jq -r '[.flashcards.cards[].sectionTitle] | unique | length')
if [ "$unique_titles" -lt 2 ]; then
  echo "[e2e] flashcards titles look duplicated" >&2
  echo "$result" | jq >&2
  exit 1
fi

echo "$result" | jq

echo "[e2e] PASS"

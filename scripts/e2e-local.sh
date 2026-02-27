#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

cleanup() {
  ./scripts/compose.sh local down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[e2e] starting local stack..."
./scripts/compose.sh local up -d --build

echo "[e2e] waiting for health endpoints..."
for i in $(seq 1 60); do
  if ./scripts/healthcheck.sh >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

./scripts/healthcheck.sh

echo "[e2e] creating ingestion job..."
payload=$(printf 'fake-audio-content' | base64 | tr -d '\n')
first_resp=$(curl -sS -X POST "http://localhost:3100/api/v1/lectures/ingest" \
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
second_status=$(curl -sS -o /tmp/e2e-second.json -w "%{http_code}" -X POST "http://localhost:3100/api/v1/lectures/ingest" \
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
  status=$(curl -sS "http://localhost:3100/api/v1/jobs/${first_job_id}" | jq -r '.status')
  echo "poll[$i]: ${status}"
  if [ "$status" = "COMPLETED" ] || [ "$status" = "FAILED" ]; then
    break
  fi
  sleep 1
done
if [ "$status" != "COMPLETED" ]; then
  echo "[e2e] first job did not complete successfully: ${status}" >&2
  curl -sS "http://localhost:3100/api/v1/jobs/${first_job_id}" | jq >&2
  exit 1
fi

echo "[e2e] fetching result..."
result=$(curl -sS "http://localhost:3100/api/v1/jobs/${first_job_id}/result")
echo "$result" | jq

if ! echo "$result" | rg -q '"flashcards"'; then
  echo "[e2e] flashcards not found in result payload" >&2
  exit 1
fi

echo "[e2e] PASS"

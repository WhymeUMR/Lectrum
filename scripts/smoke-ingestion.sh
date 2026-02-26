#!/usr/bin/env bash
set -euo pipefail

api_url="${1:-http://localhost:3100}"
file_name="${2:-lecture-smoke.mp3}"

payload=$(printf 'fake-audio-content' | base64 | tr -d '\n')

resp=$(curl -sS -X POST "${api_url}/api/v1/lectures/ingest" \
  -H 'content-type: application/json' \
  -d "{\"sourceType\":\"upload\",\"filename\":\"${file_name}\",\"mimeType\":\"audio/mpeg\",\"requestedLanguage\":\"ru\",\"fileBase64\":\"${payload}\"}")

job_id=$(echo "$resp" | jq -r '.jobId')
if [ -z "$job_id" ] || [ "$job_id" = "null" ]; then
  echo "Failed to create ingestion job"
  echo "$resp"
  exit 1
fi

echo "Created job: ${job_id}"

status="QUEUED"
for i in $(seq 1 20); do
  status=$(curl -sS "${api_url}/api/v1/jobs/${job_id}" | jq -r '.status')
  echo "poll[$i]: ${status}"
  if [ "$status" = "COMPLETED" ] || [ "$status" = "FAILED" ]; then
    break
  fi
  sleep 1
done

if [ "$status" != "COMPLETED" ]; then
  echo "Job ended with status: ${status}"
  curl -sS "${api_url}/api/v1/jobs/${job_id}" | jq
  exit 1
fi

echo "Result:"
curl -sS "${api_url}/api/v1/jobs/${job_id}/result" | jq

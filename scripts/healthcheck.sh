#!/usr/bin/env bash
set -euo pipefail

services=(
  "api-gateway:3100"
  "ingestion-service:3101"
  "transcription-worker:3102"
  "flashcard-worker:3103"
  "highlight-worker:3104"
  "summary-worker:3105"
  "summary-fallback-worker:3106"
  "frontend-prototype:80"
)

echo "Checking docker compose service health..."
docker compose ps

echo
for service in "${services[@]}"; do
  name="${service%%:*}"
  port="${service##*:}"
  printf "%-24s" "$name"
  curl -fsS "http://localhost:${port}/health" >/dev/null && echo "OK" || echo "FAILED"
done

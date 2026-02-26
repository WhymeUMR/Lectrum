#!/usr/bin/env bash
set -euo pipefail

profile="${1:-local}"
shift || true

if [ "$#" -eq 0 ]; then
  echo "Usage: ./scripts/compose.sh <local|staging|production> <docker-compose-args...>" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "scripts/load-env.sh" "$profile"

# Containers must use in-network hostnames for compose networking.
export REDIS_URL="redis://redis:6379/${REDIS_DB}"
export DATABASE_URL="postgres://app:app@postgres:5432/${POSTGRES_DB:-lecture_flashcards}"

docker compose "$@"

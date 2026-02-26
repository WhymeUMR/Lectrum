#!/usr/bin/env bash
set -euo pipefail

profile="${1:-local}"
skip_redis="${2:-}"

# shellcheck source=/dev/null
source "scripts/load-env.sh" "$profile"

required=(
  APP_ENV
  NODE_ENV
  REDIS_URL
  REDIS_QUEUE_PREFIX
  REDIS_DB
  REDIS_CONNECT_TIMEOUT_MS
  REDIS_MAX_RETRIES_PER_REQUEST
)

for key in "${required[@]}"; do
  value="${!key:-}"
  if [ -z "$value" ]; then
    echo "Missing required env var: $key" >&2
    exit 1
  fi
done

echo "CONFIG_OK profile=$profile app_env=$APP_ENV redis_prefix=$REDIS_QUEUE_PREFIX redis_db=$REDIS_DB"

if [ "$skip_redis" = "--skip-redis" ]; then
  exit 0
fi

node scripts/redis-ping.mjs "$REDIS_URL" "$REDIS_DB" "$REDIS_CONNECT_TIMEOUT_MS" "${REDIS_ENABLE_TLS:-false}"

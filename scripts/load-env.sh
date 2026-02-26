#!/usr/bin/env bash
set -euo pipefail

profile="${1:-local}"
case "$profile" in
  local|staging|production) ;;
  *)
    echo "Unsupported profile: $profile" >&2
    echo "Supported: local | staging | production" >&2
    exit 1
    ;;
esac

env_file="env/.env.${profile}"
if [ ! -f "$env_file" ]; then
  echo "Missing $env_file" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$env_file"
set +a

export APP_ENV="${APP_ENV:-$profile}"

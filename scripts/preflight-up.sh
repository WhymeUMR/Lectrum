#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  echo "[preflight-up] $*"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

try_install_docker_macos() {
  if ! has_cmd brew; then
    return 1
  fi

  log "Docker не найден. Пытаюсь установить Docker Desktop через Homebrew Cask..."
  brew install --cask docker || return 1

  log "Запускаю Docker Desktop..."
  open -a Docker || true
  return 0
}

ensure_env_file() {
  if [ -f .env ]; then
    return 0
  fi
  if [ ! -f .env.example ]; then
    log "Файл .env.example не найден. Не могу создать .env автоматически."
    return 1
  fi
  cp .env.example .env
  log "Создан .env из .env.example"
}

ensure_node_modules() {
  if [ -d node_modules ]; then
    return 0
  fi
  if ! has_cmd npm; then
    log "npm не найден. Установите Node.js (вместе с npm) и повторите."
    return 1
  fi
  log "node_modules не найден. Выполняю npm ci..."
  npm ci
}

ensure_docker() {
  if has_cmd docker; then
    return 0
  fi

  case "$(uname -s)" in
    Darwin)
      try_install_docker_macos || {
        log "Не удалось автоматически установить Docker."
        log "Установите Docker Desktop вручную: https://www.docker.com/products/docker-desktop/"
        return 1
      }
      ;;
    *)
      log "Docker CLI не найден."
      log "Установите Docker Engine и Docker Compose Plugin для вашей ОС."
      return 1
      ;;
  esac

  if ! has_cmd docker; then
    log "Docker все еще недоступен в PATH. Перезапустите терминал и повторите."
    return 1
  fi
}

ensure_docker_compose() {
  if docker compose version >/dev/null 2>&1; then
    return 0
  fi
  log "Команда 'docker compose' недоступна."
  log "Убедитесь, что установлен Docker Compose Plugin."
  return 1
}

ensure_docker_running() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  case "$(uname -s)" in
    Darwin)
      log "Docker daemon недоступен. Пытаюсь запустить Docker Desktop..."
      open -a Docker || true
      ;;
  esac

  log "Ожидаю готовность Docker daemon (до 60 секунд)..."
  for _ in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then
      log "Docker daemon готов."
      return 0
    fi
    sleep 2
  done

  log "Docker daemon так и не стал доступен."
  return 1
}

main() {
  ensure_env_file
  ensure_node_modules
  ensure_docker
  ensure_docker_compose
  ensure_docker_running
  log "Preflight пройден."
}

main "$@"

#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
APP_ENV_FILE="${APP_ENV_FILE:-$PROJECT_ROOT/.env}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$SCRIPT_DIR/.env}"

cd "$SCRIPT_DIR"

resolve_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    COMPOSE_FLAVOR="docker-compose-v2"
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    COMPOSE_FLAVOR="docker-compose-v1"
    return 0
  fi

  echo "Neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
}

cleanup_legacy_service_containers() {
  if [[ "${COMPOSE_FLAVOR:-}" != "docker-compose-v1" ]]; then
    return 0
  fi

  echo "Detected legacy docker-compose v1, removing existing service containers before recreate"
  "${COMPOSE_CMD[@]}" rm -fs app nginx >/dev/null 2>&1 || true
}

if [[ ! -f "$APP_ENV_FILE" ]]; then
  echo "Missing app env file: $APP_ENV_FILE" >&2
  echo "Create it first, for example: cp .env.example .env" >&2
  exit 1
fi

if [[ ! -f "$DEPLOY_ENV_FILE" ]]; then
  echo "Missing deploy env file: $DEPLOY_ENV_FILE" >&2
  echo "Create it first, for example: cp deploy/.env.example deploy/.env" >&2
  exit 1
fi

resolve_compose_cmd
cleanup_legacy_service_containers
mkdir -p certbot/www certbot/conf
"${COMPOSE_CMD[@]}" up -d --build

echo "Application stack is up."

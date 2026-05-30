#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
APP_ENV_FILE="${APP_ENV_FILE:-$PROJECT_ROOT/.env}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$SCRIPT_DIR/.env}"

cd "$SCRIPT_DIR"

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

mkdir -p certbot/www certbot/conf
docker compose up -d --build

echo "Application stack is up."

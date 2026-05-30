#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
WEBROOT_DIR="$SCRIPT_DIR/certbot/www"
HOST_CERT_ROOT="$SCRIPT_DIR/certbot/conf"
CERTBOT_WORK_DIR="$SCRIPT_DIR/certbot/work"
CERTBOT_LOGS_DIR="$SCRIPT_DIR/certbot/logs"

cd "$SCRIPT_DIR"

resolve_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    return 0
  fi

  echo "Neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
}

resolve_certbot_cmd() {
  if command -v certbot >/dev/null 2>&1; then
    CERTBOT_CMD=(certbot)
    CERTBOT_FLAVOR="host"
    return 0
  fi

  if docker image inspect certbot/certbot >/dev/null 2>&1; then
    CERTBOT_CMD=(
      docker run --rm
      -v "$WEBROOT_DIR:/var/www/certbot"
      -v "$HOST_CERT_ROOT:/etc/letsencrypt"
      certbot/certbot
    )
    CERTBOT_FLAVOR="docker"
    return 0
  fi

  echo "Neither host 'certbot' nor local 'certbot/certbot' Docker image is available." >&2
  echo "Install certbot on the host, or run: docker pull certbot/certbot" >&2
  exit 1
}

mkdir -p "$WEBROOT_DIR" "$HOST_CERT_ROOT" "$CERTBOT_WORK_DIR" "$CERTBOT_LOGS_DIR"
resolve_compose_cmd
resolve_certbot_cmd

renew_args=("${CERTBOT_CMD[@]}" renew)

if [[ "$CERTBOT_FLAVOR" == "host" ]]; then
  renew_args+=(
    --config-dir "$HOST_CERT_ROOT"
    --work-dir "$CERTBOT_WORK_DIR"
    --logs-dir "$CERTBOT_LOGS_DIR"
    --webroot
    -w "$WEBROOT_DIR"
  )
else
  renew_args+=(
    --webroot
    -w /var/www/certbot
  )
fi

renew_args+=("$@")

"${renew_args[@]}"

"${COMPOSE_CMD[@]}" restart nginx

echo "Certificate renewal completed."

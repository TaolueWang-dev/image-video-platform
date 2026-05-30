#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
WEBROOT_DIR="$SCRIPT_DIR/certbot/www"
HOST_CERT_ROOT="$SCRIPT_DIR/certbot/conf"

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

mkdir -p "$WEBROOT_DIR" "$HOST_CERT_ROOT"
resolve_compose_cmd

docker run --rm \
  -v "$WEBROOT_DIR:/var/www/certbot" \
  -v "$HOST_CERT_ROOT:/etc/letsencrypt" \
  certbot/certbot renew --webroot -w /var/www/certbot "$@"

"${COMPOSE_CMD[@]}" restart nginx

echo "Certificate renewal completed."

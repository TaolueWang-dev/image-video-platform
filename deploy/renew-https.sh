#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
WEBROOT_DIR="$SCRIPT_DIR/certbot/www"
HOST_CERT_ROOT="$SCRIPT_DIR/certbot/conf"

cd "$SCRIPT_DIR"

mkdir -p "$WEBROOT_DIR" "$HOST_CERT_ROOT"

docker run --rm \
  -v "$WEBROOT_DIR:/var/www/certbot" \
  -v "$HOST_CERT_ROOT:/etc/letsencrypt" \
  certbot/certbot renew --webroot -w /var/www/certbot "$@"

docker compose restart nginx

echo "Certificate renewal completed."

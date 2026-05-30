#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
APP_ENV_FILE="${APP_ENV_FILE:-$PROJECT_ROOT/.env}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$SCRIPT_DIR/.env}"
LETSENCRYPT_CONTAINER_ROOT=/etc/letsencrypt
HOST_CERT_ROOT="$SCRIPT_DIR/certbot/conf"
WEBROOT_DIR="$SCRIPT_DIR/certbot/www"

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

read_env_value() {
  local file="$1"
  local key="$2"
  local line value

  line=$(grep -m 1 -E "^${key}=" "$file" || true)
  if [[ -z "$line" ]]; then
    return 0
  fi

  value="${line#*=}"
  value="${value%$'\r'}"

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:-1}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:-1}"
  fi

  printf '%s' "$value"
}

load_env_var() {
  local key="$1"
  local value="${!key-}"

  if [[ -n "$value" ]]; then
    export "$key"
    return 0
  fi

  value="$(read_env_value "$APP_ENV_FILE" "$key")"
  if [[ -z "$value" ]]; then
    value="$(read_env_value "$DEPLOY_ENV_FILE" "$key")"
  fi

  if [[ -n "$value" ]]; then
    printf -v "$key" '%s' "$value"
    export "$key"
  fi
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

load_env_var PUBLIC_BASE_URL
load_env_var NGINX_SERVER_NAME
load_env_var NGINX_SSL_CERTIFICATE
load_env_var NGINX_SSL_CERTIFICATE_KEY
load_env_var CERTBOT_EMAIL
load_env_var CERTBOT_DOMAINS
load_env_var CERTBOT_STAGING

: "${PUBLIC_BASE_URL:?Set PUBLIC_BASE_URL in .env}"
: "${NGINX_SERVER_NAME:?Set NGINX_SERVER_NAME in deploy/.env}"
: "${NGINX_SSL_CERTIFICATE:?Set NGINX_SSL_CERTIFICATE in deploy/.env}"
: "${NGINX_SSL_CERTIFICATE_KEY:?Set NGINX_SSL_CERTIFICATE_KEY in deploy/.env}"
: "${CERTBOT_EMAIL:?Set CERTBOT_EMAIL in deploy/.env}"

if [[ "$PUBLIC_BASE_URL" != https://* ]]; then
  echo "PUBLIC_BASE_URL must start with https:// for HTTPS deployment." >&2
  exit 1
fi

public_base_host="${PUBLIC_BASE_URL#https://}"
public_base_host="${public_base_host%%/*}"
if [[ "$public_base_host" != "$NGINX_SERVER_NAME" ]]; then
  echo "Warning: PUBLIC_BASE_URL host ($public_base_host) differs from NGINX_SERVER_NAME ($NGINX_SERVER_NAME)." >&2
fi

if [[ "$NGINX_SSL_CERTIFICATE" != "$LETSENCRYPT_CONTAINER_ROOT/"* ]]; then
  echo "NGINX_SSL_CERTIFICATE must stay under $LETSENCRYPT_CONTAINER_ROOT." >&2
  exit 1
fi

if [[ "$NGINX_SSL_CERTIFICATE_KEY" != "$LETSENCRYPT_CONTAINER_ROOT/"* ]]; then
  echo "NGINX_SSL_CERTIFICATE_KEY must stay under $LETSENCRYPT_CONTAINER_ROOT." >&2
  exit 1
fi

host_certificate_path="${HOST_CERT_ROOT}${NGINX_SSL_CERTIFICATE#$LETSENCRYPT_CONTAINER_ROOT}"
host_certificate_key_path="${HOST_CERT_ROOT}${NGINX_SSL_CERTIFICATE_KEY#$LETSENCRYPT_CONTAINER_ROOT}"

mkdir -p \
  "$WEBROOT_DIR" \
  "$(dirname -- "$host_certificate_path")" \
  "$(dirname -- "$host_certificate_key_path")"

domains_raw="${CERTBOT_DOMAINS:-$NGINX_SERVER_NAME}"
IFS=',' read -r -a certbot_domains <<< "$domains_raw"
domains=()
for raw_domain in "${certbot_domains[@]}"; do
  domain="${raw_domain//[[:space:]]/}"
  if [[ -n "$domain" ]]; then
    domains+=("$domain")
  fi
done

if [[ "${#domains[@]}" -eq 0 ]]; then
  echo "Set CERTBOT_DOMAINS to at least one domain in deploy/.env." >&2
  exit 1
fi

primary_domain="${domains[0]}"

if [[ ! -s "$host_certificate_path" || ! -s "$host_certificate_key_path" ]]; then
  echo "Creating temporary self-signed certificate for $primary_domain"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$host_certificate_key_path" \
    -out "$host_certificate_path" \
    -subj "/CN=$primary_domain"
fi

echo "Starting app and nginx"
"${COMPOSE_CMD[@]}" up -d --build app nginx

certbot_args=(
  docker run --rm
  -v "$WEBROOT_DIR:/var/www/certbot"
  -v "$HOST_CERT_ROOT:/etc/letsencrypt"
  certbot/certbot certonly
  --webroot
  -w /var/www/certbot
  --email "$CERTBOT_EMAIL"
  --agree-tos
  --no-eff-email
)

if [[ "${CERTBOT_STAGING:-0}" == "1" ]]; then
  certbot_args+=(--staging)
fi

for domain in "${domains[@]}"; do
  certbot_args+=(-d "$domain")
done

echo "Requesting Let's Encrypt certificate for: ${domains[*]}"
"${certbot_args[@]}"

echo "Reloading nginx with the issued certificate"
"${COMPOSE_CMD[@]}" restart nginx

echo "HTTPS setup completed."

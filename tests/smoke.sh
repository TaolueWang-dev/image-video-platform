#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:3000}"
HAS_EXPLICIT_BASE_URL=0
if [[ -n "${SMOKE_BASE_URL:-}" ]]; then
  HAS_EXPLICIT_BASE_URL=1
fi
WRITE_MODE="${SMOKE_WRITE:-0}"
COOKIE_JAR="$(mktemp)"
ADMIN_COOKIE_JAR="$(mktemp)"
SUPER_ADMIN_COOKIE_JAR="$(mktemp)"
MANAGED_USER_COOKIE_JAR="$(mktemp)"
DEFAULT_DATA_DIR="$(
  if [[ -f .env ]]; then
    sed -n 's/^DATA_DIR=//p' .env | head -n 1
  fi
)"
SMOKE_DATA_DIR="${SMOKE_DATA_DIR:-${DEFAULT_DATA_DIR:-data}}"
DEFAULT_SMOKE_AUTH_EMAIL="$(
  if [[ -f .env ]]; then
    sed -n 's/^SMOKE_AUTH_EMAIL=//p' .env | head -n 1
  fi
)"
SMOKE_AUTH_EMAIL="${SMOKE_AUTH_EMAIL:-${DEFAULT_SMOKE_AUTH_EMAIL:-smoke-user@example.com}}"
SMOKE_AUTH_SUBJECT_TYPE="${SMOKE_AUTH_SUBJECT_TYPE:-user}"
SMOKE_OPERATOR_EMAIL="${SMOKE_OPERATOR_EMAIL:-smoke-operator@example.com}"
SMOKE_SUPER_ADMIN_EMAIL="${SMOKE_SUPER_ADMIN_EMAIL:-smoke-admin@example.com}"

cleanup() {
  rm -f "${COOKIE_JAR}"
  rm -f "${ADMIN_COOKIE_JAR}"
  rm -f "${SUPER_ADMIN_COOKIE_JAR}"
  rm -f "${MANAGED_USER_COOKIE_JAR}"
}

trap cleanup EXIT

if [[ "${SMOKE_IN_PROCESS:-0}" == "1" ]]; then
  node tests/smoke-runner.mjs
  exit
fi

if [[ "${HAS_EXPLICIT_BASE_URL}" != "1" ]]; then
  node tests/smoke-runner.mjs
  exit
fi

if ! curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1; then
  node tests/smoke-runner.mjs
  exit
fi

curl_with_retry() {
  local -i attempt=1
  local -i max_attempts=5
  local url="$1"
  shift

  while (( attempt <= max_attempts )); do
    if curl -fsS "$@" "${url}"; then
      return 0
    fi
    sleep 1
    ((attempt++))
  done

  curl -fsS "$@" "${url}"
}

http_get() {
  curl_with_retry "$1"
}

auth_http_get() {
  curl_with_retry "$1" -b "${COOKIE_JAR}"
}

json_get() {
  http_get "$1"
}

auth_json_get() {
  auth_http_get "$1"
}

json_post() {
  local url="$1"
  local body="$2"
  curl_with_retry "${url}" -X POST \
    -H 'Content-Type: application/json' \
    --data "${body}"
}

auth_json_post() {
  local url="$1"
  local body="$2"
  curl_with_retry "${url}" -b "${COOKIE_JAR}" -X POST \
    -H 'Content-Type: application/json' \
    --data "${body}"
}

json_post_with_cookie_jar() {
  local url="$1"
  local cookie_jar="$2"
  local body="$3"
  curl_with_retry "${url}" -c "${cookie_jar}" -i -sS -X POST \
    -H 'Content-Type: application/json' \
    --data "${body}"
}

auth_json_get_with_cookie_jar() {
  local url="$1"
  local cookie_jar="$2"
  curl_with_retry "${url}" -b "${cookie_jar}"
}

auth_json_post_with_cookie_jar() {
  local url="$1"
  local cookie_jar="$2"
  local body="$3"
  curl_with_retry "${url}" -b "${cookie_jar}" -X POST \
    -H 'Content-Type: application/json' \
    --data "${body}"
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local label="$3"
  [[ "${haystack}" == *"${needle}"* ]] || {
    printf 'missing expected content for %s: %s\n' "${label}" "${needle}" >&2
    exit 1
  }
}

check_page() {
  local route="$1"
  local page_label="$2"
  local body="$3"
  shift 3

  body="$(http_get "${BASE_URL}${route}")"
  assert_contains "${body}" "<!DOCTYPE html>" "${page_label} doctype"

  while (($#)); do
    assert_contains "${body}" "$1" "${page_label} hook"
    shift
  done
}

check_app_js() {
  local body
  body="$(sed -n '1,1700p' public/app.js)"
  assert_contains "${body}" 'const PROTECTED_PAGES = new Set(["home", "image", "video", "recharge", "profile", "admin"]);' 'app.js protected pages'
  assert_contains "${body}" 'if (isProtectedPage() && !me.authenticated) {' 'app.js protected-page auth gate'
  assert_contains "${body}" 'redirectToLogin();' 'app.js login redirect helper usage'
  assert_contains "${body}" 'const redirectTo = new URLSearchParams(window.location.search).get("redirectTo") || "";' 'app.js redirectTo parsing'
}

assert_status() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  [[ "${actual}" == "${expected}" ]] || {
    printf 'unexpected status for %s: expected %s got %s\n' "${label}" "${expected}" "${actual}" >&2
    exit 1
  }
}

status_get() {
  curl_with_retry "$1" -o /dev/null -w '%{http_code}'
}

status_get_with_cookie_jar() {
  local url="$1"
  local cookie_jar="$2"
  curl_with_retry "${url}" -b "${cookie_jar}" -o /dev/null -w '%{http_code}'
}

seed_smoke_user() {
  mkdir -p "${SMOKE_DATA_DIR}"
  node --input-type=module -e '
    import fs from "node:fs";
    import path from "node:path";

    const dataDir = process.argv[1];
    const email = process.argv[2];
    const subjectType = process.argv[3];
    if (subjectType !== "user") {
      process.exit(0);
    }

    const filePath = path.join(dataDir, "users.json");
    const now = new Date().toISOString();
    let users = [];
    if (fs.existsSync(filePath)) {
      users = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }

    const existingIndex = users.findIndex((item) => item.email === email);
    const nextUser = {
      id: existingIndex >= 0 ? users[existingIndex].id : "user_smoke",
      email,
      status: "active",
      createdAt: existingIndex >= 0 ? (users[existingIndex].createdAt || now) : now,
      updatedAt: now,
      lastLoginAt: existingIndex >= 0 ? (users[existingIndex].lastLoginAt || "") : "",
    };

    if (existingIndex >= 0) {
      users[existingIndex] = { ...users[existingIndex], ...nextUser };
    } else {
      users.push(nextUser);
    }

    fs.writeFileSync(filePath, `${JSON.stringify(users, null, 2)}\n`);
  ' "${SMOKE_DATA_DIR}" "${SMOKE_AUTH_EMAIL}" "${SMOKE_AUTH_SUBJECT_TYPE}"
}

seed_smoke_admins() {
  mkdir -p "${SMOKE_DATA_DIR}"
  node --input-type=module -e '
    import fs from "node:fs";
    import path from "node:path";

    const dataDir = process.argv[1];
    const operatorEmail = process.argv[2];
    const superAdminEmail = process.argv[3];
    const filePath = path.join(dataDir, "admin-users.json");
    const now = new Date().toISOString();

    let admins = [];
    if (fs.existsSync(filePath)) {
      admins = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }

    const ensureAdmin = (email, role, id) => {
      const index = admins.findIndex((item) => item.email === email);
      const next = {
        id: index >= 0 ? admins[index].id : id,
        email,
        role,
        status: "active",
        createdAt: index >= 0 ? (admins[index].createdAt || now) : now,
        updatedAt: now,
        lastLoginAt: index >= 0 ? (admins[index].lastLoginAt || "") : "",
      };

      if (index >= 0) {
        admins[index] = { ...admins[index], ...next };
      } else {
        admins.push(next);
      }
    };

    ensureAdmin(operatorEmail, "operator", "admin_operator_smoke");
    ensureAdmin(superAdminEmail, "super_admin", "admin_super_smoke");
    fs.writeFileSync(filePath, `${JSON.stringify(admins, null, 2)}\n`);
  ' "${SMOKE_DATA_DIR}" "${SMOKE_OPERATOR_EMAIL}" "${SMOKE_SUPER_ADMIN_EMAIL}"
}

seed_order_for_user() {
  local user_id="$1"
  mkdir -p "${SMOKE_DATA_DIR}"
  node --input-type=module -e '
    import fs from "node:fs";
    import path from "node:path";

    const dataDir = process.argv[1];
    const userId = process.argv[2];
    const filePath = path.join(dataDir, "orders.json");
    const now = new Date().toISOString();
    let orders = [];
    if (fs.existsSync(filePath)) {
      orders = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }

    orders.push({
      id: `order_${Date.now()}`,
      userId,
      outTradeNo: `trade_${Date.now()}`,
      subject: "Admin smoke order",
      amount: 100,
      channel: "alipay",
      method: "alipay",
      paymentType: "alipay",
      paymentProvider: "junliai",
      status: "pending",
      metadata: {
        source: "tests/smoke.sh",
        kind: "admin-orders"
      },
      paymentPayload: {
        integrationMode: "skeleton"
      },
      createdAt: now,
      updatedAt: now
    });

    fs.writeFileSync(filePath, `${JSON.stringify(orders, null, 2)}\n`);
  ' "${SMOKE_DATA_DIR}" "${user_id}"
}

login_with_email_code() {
  local email="$1"
  local subject_type="$2"
  local cookie_jar="$3"
  local request_code_response
  local response
  local dev_code

  request_code_response="$(json_post "${BASE_URL}/api/auth/email/request-code" "{\"email\":\"${email}\",\"subjectType\":\"${subject_type}\"}")"
  assert_contains "${request_code_response}" "\"email\":\"${email}\"" "request-code ${email}"
  dev_code="$(printf '%s' "${request_code_response}" | sed -n 's/.*"devCode":"\([0-9]\{6\}\)".*/\1/p')"
  [[ -n "${dev_code}" ]] || {
    printf 'missing devCode for %s\n' "${email}" >&2
    exit 1
  }
  response="$(json_post_with_cookie_jar "${BASE_URL}/api/auth/email/verify-code" "${cookie_jar}" "{\"email\":\"${email}\",\"subjectType\":\"${subject_type}\",\"code\":\"${dev_code}\"}")"
  assert_contains "${response}" 'set-cookie:' "verify-code ${email} set-cookie header"
  assert_contains "${response}" '"authenticated":true' "verify-code ${email} authenticated state"
}

main() {
  local response
  local me_response
  local request_code_response
  local dev_code
  local protected_status
  local admin_response
  local managed_user_email
  local managed_user_id

  check_page "/" "home page" 'id="recent-orders"' 'id="recent-video-tasks"' 'id="refresh-account"'
  check_page "/image" "image page" \
    'id="image-form"' \
    'id="image-thread"' \
    'id="image-message"' \
    'id="image-status"' \
    'id="image-session-select"' \
    'id="image-session-new"' \
    'id="image-session-rename"' \
    'id="image-session-delete"' \
    'id="image-session-meta"' \
    'id="image-followup-panel"' \
    'id="image-composer-hint"' \
    'name="prompt"' \
    'name="model"' \
    'name="size"' \
    'name="quality"'
  check_page "/video" "video page" \
    'id="video-form"' \
    'id="video-thread"' \
    'id="video-message"' \
    'id="video-status"' \
    'id="video-session-select"' \
    'id="video-session-new"' \
    'id="video-session-rename"' \
    'id="video-session-delete"' \
    'id="video-session-meta"' \
    'id="video-attachment-trigger"' \
    'id="video-attachment-input"' \
    'id="video-attachment-panel"' \
    'id="video-composer-hint"' \
    'name="prompt"' \
    'name="duration"' \
    'name="resolution"' \
    'name="aspectRatio"'
  check_page "/recharge" "recharge page" 'id="recharge-form"' 'id="payment-result"' 'id="recent-orders"'
  check_app_js

  json_get "${BASE_URL}/api/health" >/dev/null
  json_get "${BASE_URL}/api/config" >/dev/null
  me_response="$(json_get "${BASE_URL}/api/me")"
  assert_contains "${me_response}" '"authenticated":false' 'GET /api/me anonymous state'
  json_post "${BASE_URL}/api/auth/logout" '{}' >/dev/null
  protected_status="$(status_get "${BASE_URL}/api/account")"
  assert_status "401" "${protected_status}" 'GET /api/account anonymous guard'
  protected_status="$(status_get "${BASE_URL}/api/images/history?limit=1")"
  assert_status "401" "${protected_status}" 'GET /api/images/history anonymous guard'
  protected_status="$(status_get "${BASE_URL}/api/videos/tasks?limit=1")"
  assert_status "401" "${protected_status}" 'GET /api/videos/tasks anonymous guard'
  protected_status="$(status_get "${BASE_URL}/api/videos/history?limit=1")"
  assert_status "401" "${protected_status}" 'GET /api/videos/history anonymous guard'
  protected_status="$(status_get "${BASE_URL}/api/recharge/orders?limit=1")"
  assert_status "401" "${protected_status}" 'GET /api/recharge/orders anonymous guard'
  protected_status="$(status_get "${BASE_URL}/api/admin/users")"
  assert_status "401" "${protected_status}" 'GET /api/admin/users anonymous guard'

  if [[ -n "${SMOKE_AUTH_EMAIL}" ]]; then
    seed_smoke_user
    seed_smoke_admins
    login_with_email_code "${SMOKE_AUTH_EMAIL}" "${SMOKE_AUTH_SUBJECT_TYPE}" "${COOKIE_JAR}"
    login_with_email_code "${SMOKE_OPERATOR_EMAIL}" "admin" "${ADMIN_COOKIE_JAR}"
    login_with_email_code "${SMOKE_SUPER_ADMIN_EMAIL}" "admin" "${SUPER_ADMIN_COOKIE_JAR}"
  fi

  me_response="$(auth_json_get "${BASE_URL}/api/me")"
  assert_contains "${me_response}" '"authenticated":true' 'GET /api/me authenticated state'
  response="$(auth_json_get "${BASE_URL}/api/account")"
  assert_contains "${response}" '"balance":0' 'GET /api/account scoped balance'
  response="$(auth_json_get "${BASE_URL}/api/images/history?limit=1")"
  assert_contains "${response}" '"items":[]' 'GET /api/images/history scoped empty list'
  response="$(auth_json_get "${BASE_URL}/api/videos/tasks?limit=1")"
  assert_contains "${response}" '"items":[]' 'GET /api/videos/tasks scoped empty list'
  response="$(auth_json_get "${BASE_URL}/api/videos/history?limit=1")"
  assert_contains "${response}" '"items":[]' 'GET /api/videos/history scoped empty list'
  response="$(auth_json_get "${BASE_URL}/api/recharge/orders?limit=1")"
  assert_contains "${response}" '"items":[]' 'GET /api/recharge/orders scoped empty list'

  admin_response="$(auth_json_get_with_cookie_jar "${BASE_URL}/api/admin/users?limit=20" "${ADMIN_COOKIE_JAR}")"
  assert_contains "${admin_response}" "\"email\":\"${SMOKE_AUTH_EMAIL}\"" 'operator GET /api/admin/users includes seeded user'
  protected_status="$(status_get_with_cookie_jar "${BASE_URL}/api/admin/users" "${COOKIE_JAR}")"
  assert_status "403" "${protected_status}" 'user denied on admin API'
  protected_status="$(curl_with_retry "${BASE_URL}/api/admin/users" -b "${ADMIN_COOKIE_JAR}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{"email":"blocked-by-operator@example.com"}')"
  assert_status "403" "${protected_status}" 'operator denied user create'

  managed_user_email="managed-$(date +%s)@example.com"
  admin_response="$(auth_json_post_with_cookie_jar "${BASE_URL}/api/admin/users" "${SUPER_ADMIN_COOKIE_JAR}" "{\"email\":\"${managed_user_email}\"}")"
  assert_contains "${admin_response}" "\"email\":\"${managed_user_email}\"" 'super admin create user'
  managed_user_id="$(printf '%s' "${admin_response}" | sed -n 's/.*"id":"\([^"]*\)".*"email":"'"${managed_user_email//\//\\/}"'".*/\1/p')"
  [[ -n "${managed_user_id}" ]] || {
    printf 'failed to parse managed user id from %s\n' "${admin_response}" >&2
    exit 1
  }

  admin_response="$(auth_json_get_with_cookie_jar "${BASE_URL}/api/admin/users/${managed_user_id}" "${ADMIN_COOKIE_JAR}")"
  assert_contains "${admin_response}" "\"id\":\"${managed_user_id}\"" 'operator GET /api/admin/users/:id'
  assert_contains "${admin_response}" '"orderCount":0' 'admin user detail stats'

  protected_status="$(curl_with_retry "${BASE_URL}/api/admin/users/${managed_user_id}/balance-adjustments" -b "${ADMIN_COOKIE_JAR}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{"amountDelta":100,"reason":"operator denied"}')"
  assert_status "403" "${protected_status}" 'operator denied balance adjustment'
  admin_response="$(auth_json_post_with_cookie_jar "${BASE_URL}/api/admin/users/${managed_user_id}/balance-adjustments" "${SUPER_ADMIN_COOKIE_JAR}" '{"amountDelta":250,"reason":"smoke credit"}')"
  assert_contains "${admin_response}" '"amountDelta":250' 'super admin balance adjustment'
  assert_contains "${admin_response}" '"balance":250' 'super admin balance adjustment result'

  seed_order_for_user "${managed_user_id}"

  admin_response="$(auth_json_get_with_cookie_jar "${BASE_URL}/api/admin/users/${managed_user_id}/orders?limit=10" "${ADMIN_COOKIE_JAR}")"
  assert_contains "${admin_response}" '"total":1' 'admin GET /api/admin/users/:id/orders'
  assert_contains "${admin_response}" "\"userId\":\"${managed_user_id}\"" 'admin orders are scoped to target user'

  admin_response="$(auth_json_post_with_cookie_jar "${BASE_URL}/api/admin/users/${managed_user_id}/disable" "${SUPER_ADMIN_COOKIE_JAR}" '{}')"
  assert_contains "${admin_response}" '"status":"disabled"' 'super admin disable user'
  protected_status="$(curl_with_retry "${BASE_URL}/api/auth/email/request-code" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data "{\"email\":\"${managed_user_email}\",\"subjectType\":\"user\"}")"
  assert_status "400" "${protected_status}" 'disabled user cannot request login code'
  admin_response="$(auth_json_post_with_cookie_jar "${BASE_URL}/api/admin/users/${managed_user_id}/enable" "${SUPER_ADMIN_COOKIE_JAR}" '{}')"
  assert_contains "${admin_response}" '"status":"active"' 'super admin enable user'

  if [[ "${WRITE_MODE}" == "1" || "${WRITE_MODE}" == "true" || "${WRITE_MODE}" == "yes" ]]; then
    response="$(auth_json_post "${BASE_URL}/api/recharge/orders" '{"channel":"alipay","amount":100,"subject":"Junliai smoke recharge","metadata":{"source":"tests/smoke.sh"}}')"
    [[ "${response}" == *'"channel":"alipay"'* ]] || {
      printf 'unexpected recharge order payload: %s\n' "${response}" >&2
      exit 1
    }
    [[ "${response}" == *'"paymentProvider":"junliai"'* ]] || {
      printf 'unexpected payment provider payload: %s\n' "${response}" >&2
      exit 1
    }
    [[ "${response}" == *'"id":'* ]] || {
      printf 'unexpected recharge order id payload: %s\n' "${response}" >&2
      exit 1
    }
    [[ "${response}" == *'"amount":100'* ]] || {
      printf 'unexpected recharge order amount payload: %s\n' "${response}" >&2
      exit 1
    }
    response="$(auth_json_get "${BASE_URL}/api/recharge/orders?limit=1")"
    assert_contains "${response}" '"total":1' 'GET /api/recharge/orders created record'
    assert_contains "${response}" "\"userId\":\"user_smoke\"" 'GET /api/recharge/orders created owner'
    printf '%s\n' '{"ok":true,"checked":["GET /","GET /image","GET /video","GET /recharge","frontend protected-page login redirect contract","GET /api/health","GET /api/config","GET /api/me","POST /api/auth/logout","anonymous guards on user-owned APIs","anonymous guard on /api/admin/users","authenticated GET /api/account","authenticated GET /api/images/history?limit=1","authenticated GET /api/videos/tasks?limit=1","authenticated GET /api/videos/history?limit=1","authenticated GET /api/recharge/orders?limit=1","operator GET /api/admin/users","operator GET /api/admin/users/:id","operator denied on POST /api/admin/users","operator denied on POST /api/admin/users/:id/balance-adjustments","super admin POST /api/admin/users","super admin POST /api/admin/users/:id/balance-adjustments","super admin POST /api/admin/users/:id/disable","super admin POST /api/admin/users/:id/enable","GET /api/admin/users/:id/orders","POST /api/recharge/orders"]}'
    return
  fi

  printf '%s\n' '{"ok":true,"checked":["GET /","GET /image","GET /video","GET /recharge","frontend protected-page login redirect contract","GET /api/health","GET /api/config","GET /api/me","POST /api/auth/logout","anonymous guards on user-owned APIs","anonymous guard on /api/admin/users","authenticated GET /api/account","authenticated GET /api/images/history?limit=1","authenticated GET /api/videos/tasks?limit=1","authenticated GET /api/videos/history?limit=1","authenticated GET /api/recharge/orders?limit=1","operator GET /api/admin/users","operator GET /api/admin/users/:id","operator denied on POST /api/admin/users","operator denied on POST /api/admin/users/:id/balance-adjustments","super admin POST /api/admin/users","super admin POST /api/admin/users/:id/balance-adjustments","super admin POST /api/admin/users/:id/disable","super admin POST /api/admin/users/:id/enable","GET /api/admin/users/:id/orders"]}'
}

main "$@"

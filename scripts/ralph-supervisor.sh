#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SESSION_NAME="${RALPH_SESSION_NAME:-ralph-auto}"
POLL_SECONDS="${RALPH_SUPERVISOR_POLL_SECONDS:-20}"
STALE_SECONDS="${RALPH_SUPERVISOR_STALE_SECONDS:-180}"
LOG_FILE="$PROJECT_DIR/logs/ralph-supervisor.log"

mkdir -p "$PROJECT_DIR/logs"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"
}

all_specs_complete() {
  local found_any=false
  local spec
  while IFS= read -r spec; do
    found_any=true
    if ! grep -q '^Status: COMPLETE$' "$spec"; then
      return 1
    fi
  done < <(find "$PROJECT_DIR/specs" -maxdepth 1 -type f -name '*.md' | sort)

  if [ "$found_any" != true ]; then
    return 1
  fi
  return 0
}

latest_session_log() {
  ls -t "$PROJECT_DIR"/logs/ralph_codex_build_session_*.log 2>/dev/null | head -n 1 || true
}

start_ralph() {
  log "starting Ralph loop in tmux session $SESSION_NAME"
  tmux new-session -d -s "$SESSION_NAME" "cd '$PROJECT_DIR' && ./scripts/ralph-loop-codex.sh"
}

kill_ralph() {
  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    log "stopping tmux session $SESSION_NAME"
    tmux kill-session -t "$SESSION_NAME"
  fi
}

ensure_ralph_running() {
  if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    start_ralph
    return
  fi

  local latest_log
  latest_log="$(latest_session_log)"
  if [ -z "$latest_log" ]; then
    return
  fi

  local now epoch_mtime age
  now="$(date +%s)"
  epoch_mtime="$(stat -f '%m' "$latest_log" 2>/dev/null || echo 0)"
  age=$((now - epoch_mtime))

  if [ "$age" -gt "$STALE_SECONDS" ]; then
    log "latest Ralph log is stale (${age}s): $latest_log"
    kill_ralph
    start_ralph
  fi
}

report_status() {
  local spec
  while IFS= read -r spec; do
    local status
    status="$(grep -E '^Status:' "$spec" | head -n 1 | sed 's/^Status: //')"
    log "spec $(basename "$spec"): ${status:-UNKNOWN}"
  done < <(find "$PROJECT_DIR/specs" -maxdepth 1 -type f -name '*.md' | sort)

  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    local pane_tail
    pane_tail="$(tmux capture-pane -pt "$SESSION_NAME":0 2>/dev/null | tail -n 20 || true)"
    if [ -n "$pane_tail" ]; then
      log "latest pane tail:"
      printf '%s\n' "$pane_tail" | tee -a "$LOG_FILE"
    fi
  fi
}

main() {
  log "Ralph supervisor starting"
  while true; do
    if all_specs_complete; then
      log "all specs are COMPLETE"
      kill_ralph
      break
    fi

    ensure_ralph_running
    report_status
    sleep "$POLL_SECONDS"
  done
  log "Ralph supervisor finished"
}

main "$@"

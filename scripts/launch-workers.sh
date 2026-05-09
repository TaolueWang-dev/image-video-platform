#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/launch-workers.sh --task "Goal" --worker 'ROLE:PATHS:DELIVERABLES:CHECKS' [--worker ...]
  scripts/launch-workers.sh --task "Goal" --role ROLE --owned-path ROLE=PATH --deliverable ROLE=TEXT --check ROLE=CMD
EOF
}

repo_root() {
  git rev-parse --show-toplevel
}

repo_name() {
  basename "$(repo_root)"
}

coord_dir() {
  local root parent name
  root="$(repo_root)"
  parent="$(cd "${root}/.." && pwd)"
  name="$(repo_name)"
  printf '%s/%s.coordination\n' "${parent}" "${name}"
}

worktrees_root() {
  local root parent name
  root="$(repo_root)"
  parent="$(cd "${root}/.." && pwd)"
  name="$(repo_name)"
  printf '%s/%s.worktrees\n' "${parent}" "${name}"
}

find_role_value() {
  local role="$1"
  shift
  local entry entry_role entry_value
  for entry in "$@"; do
    entry_role="${entry%%=*}"
    entry_value="${entry#*=}"
    if [[ "${entry_role}" == "${role}" ]]; then
      printf '%s\n' "${entry_value}"
    fi
  done
}

first_role_value() {
  local role="$1"
  shift
  local value
  value="$(find_role_value "${role}" "$@" | paste -sd'|' -)"
  printf '%s' "${value}"
}

write_status() {
  local file="$1"
  local phase="$2"
  local state="$3"
  local note="$4"
  local now
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  python3 - "$file" "$now" "$phase" "$state" "$note" <<'PY'
import json
import sys

path, now, phase, state, note = sys.argv[1:6]
with open(path, "w", encoding="utf-8") as fh:
    json.dump(
        {
            "updated_at": now,
            "phase": phase,
            "state": state,
            "note": note,
        },
        fh,
        ensure_ascii=False,
        indent=2,
    )
    fh.write("\n")
PY
}

shell_quote() {
  printf '%q' "$1"
}

write_task_card() {
  local file="$1"
  local role="$2"
  local goal="$3"
  local owned_paths="$4"
  local deliverables="$5"
  local checks="$6"
  local coord="$7"

  cat >"${file}" <<EOF
# Worker Task: ${role}

## Goal
${goal}

## Role
${role}

## Owned Paths
${owned_paths//|/$'\n'}

## Deliverables
${deliverables//|/$'\n'}

## Checks
${checks//|/$'\n'}

## Coordination
- Read \`${coord}/protocol.md\`
- Read \`${coord}/decisions.md\`
- Update \`${coord}/status/${role}.json\`
- Write handoff notes to \`${coord}/handoffs/${role}.md\`
EOF
}

ensure_runtime_layout() {
  local root="$1"
  local coord="$2"
  mkdir -p "${coord}/tasks" "${coord}/status" "${coord}/handoffs" "${coord}/patterns"
  if [[ ! -f "${coord}/protocol.md" ]]; then
    cp "${root}/coordination-templates/protocol.md" "${coord}/protocol.md"
  fi
  if [[ ! -f "${coord}/decisions.md" ]]; then
    cp "${root}/coordination-templates/decisions.md" "${coord}/decisions.md"
  fi
}

main() {
  local task=""
  local -a roles=()
  local -a owned_specs=()
  local -a deliverable_specs=()
  local -a check_specs=()
  local -a worker_specs=()
  local -a create_args=()
  local tmux_session=""
  local root coord worktrees role spec paths deliverables checks window_name target

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --task)
        task="$2"
        shift 2
        ;;
      --role)
        roles+=("$2")
        shift 2
        ;;
      --owned-path)
        owned_specs+=("$2")
        shift 2
        ;;
      --deliverable)
        deliverable_specs+=("$2")
        shift 2
        ;;
      --check)
        check_specs+=("$2")
        shift 2
        ;;
      --worker)
        worker_specs+=("$2")
        shift 2
        ;;
      --tmux-session)
        tmux_session="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "error: unknown argument: $1" >&2
        usage >&2
        exit 1
        ;;
    esac
  done

  if [[ -z "${task}" ]]; then
    echo "error: --task is required" >&2
    exit 1
  fi

  if ! root="$(repo_root 2>/dev/null)"; then
    echo "error: launch-workers.sh requires a git repository" >&2
    exit 1
  fi

  if [[ ${#worker_specs[@]} -gt 0 ]]; then
    for spec in "${worker_specs[@]}"; do
      role="${spec%%:*}"
      paths="$(printf '%s' "${spec}" | cut -d: -f2)"
      deliverables="$(printf '%s' "${spec}" | cut -d: -f3)"
      checks="$(printf '%s' "${spec}" | cut -d: -f4)"
      roles+=("${role}")
      owned_specs+=("${role}=${paths}")
      deliverable_specs+=("${role}=${deliverables}")
      check_specs+=("${role}=${checks}")
    done
  fi

  if [[ ${#roles[@]} -eq 0 ]]; then
    echo "error: at least one worker role is required" >&2
    exit 1
  fi

  coord="$(coord_dir)"
  worktrees="$(worktrees_root)"
  tmux_session="${tmux_session:-$(repo_name)-workers}"

  ensure_runtime_layout "${root}" "${coord}"
  if [[ ${#worker_specs[@]} -gt 0 ]]; then
    for spec in "${worker_specs[@]}"; do
      create_args+=(--worker "${spec}")
    done
  fi
  for role in "${roles[@]}"; do
    create_args+=(--role "${role}")
  done
  "${root}/scripts/create-worktrees.sh" "${create_args[@]}"

  for role in "${roles[@]}"; do
    paths=""
    deliverables=""
    checks=""
    if [[ ${#owned_specs[@]} -gt 0 ]]; then
      paths="$(first_role_value "${role}" "${owned_specs[@]}")"
    fi
    if [[ ${#deliverable_specs[@]} -gt 0 ]]; then
      deliverables="$(first_role_value "${role}" "${deliverable_specs[@]}")"
    fi
    if [[ ${#check_specs[@]} -gt 0 ]]; then
      checks="$(first_role_value "${role}" "${check_specs[@]}")"
    fi

    [[ -n "${paths}" ]] || paths="-"
    [[ -n "${deliverables}" ]] || deliverables="-"
    [[ -n "${checks}" ]] || checks="-"

    write_task_card "${coord}/tasks/${role}.md" "${role}" "${task}" "${paths}" "${deliverables}" "${checks}" "${coord}"
    if [[ ! -f "${coord}/handoffs/${role}.md" ]]; then
      cp "${root}/coordination-templates/handoff-template.md" "${coord}/handoffs/${role}.md"
    fi
    write_status "${coord}/status/${role}.json" "plan" "queued" "Task card created"
  done

  if ! command -v tmux >/dev/null 2>&1; then
    echo "runtime prepared at ${coord}"
    echo "tmux is not installed; launch workers manually from ${worktrees}" >&2
    exit 0
  fi

  if tmux has-session -t "${tmux_session}" 2>/dev/null; then
    echo "error: tmux session already exists: ${tmux_session}" >&2
    exit 1
  fi

  role="${roles[0]}"
  target="${worktrees}/${role}"
  tmux new-session -d -s "${tmux_session}" -n "${role}" \
    "cd $(shell_quote "${target}") && $(shell_quote "${root}/scripts/worker-entrypoint.sh") $(shell_quote "${role}")"

  for role in "${roles[@]:1}"; do
    target="${worktrees}/${role}"
    window_name="${role}"
    tmux new-window -t "${tmux_session}" -n "${window_name}" \
      "cd $(shell_quote "${target}") && $(shell_quote "${root}/scripts/worker-entrypoint.sh") $(shell_quote "${role}")"
  done

  echo "launched tmux session: ${tmux_session}"
  echo "coordination dir: ${coord}"
}

main "$@"

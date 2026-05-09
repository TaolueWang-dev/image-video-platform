#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/worker-entrypoint.sh ROLE [TASK_CARD]
EOF
}

write_status() {
  local file="$1"
  local phase="$2"
  local state="$3"
  local note="$4"
  local now
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  mkdir -p "$(dirname "${file}")"
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

main() {
  local role="${1:-}"
  local task_card="${2:-}"
  local root common_dir repo_root repo_name coord_dir task_file status_file prompt_file codex_cmd

  if [[ -z "${role}" ]]; then
    usage >&2
    exit 1
  fi

  if ! root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
    echo "error: worker-entrypoint.sh requires a git worktree" >&2
    exit 1
  fi

  common_dir="$(git rev-parse --git-common-dir 2>/dev/null || true)"
  if [[ -n "${common_dir}" ]]; then
    if [[ "${common_dir}" != /* ]]; then
      common_dir="$(cd "${root}" && cd "${common_dir}" && pwd)"
    fi
    repo_root="$(cd "${common_dir}/.." && pwd)"
  else
    repo_root="${root}"
  fi

  repo_name="$(basename "${repo_root}")"
  coord_dir="$(cd "${repo_root}/.." && pwd)/${repo_name}.coordination"
  task_file="${task_card:-${coord_dir}/tasks/${role}.md}"
  status_file="${coord_dir}/status/${role}.json"
  prompt_file="${coord_dir}/tasks/${role}.prompt.txt"
  codex_cmd="${CODEX_CMD:-codex exec}"

  if [[ ! -f "${task_file}" ]]; then
    echo "error: missing task card: ${task_file}" >&2
    exit 1
  fi

  write_status "${status_file}" "execute" "starting" "Worker booting"

  cat >"${prompt_file}" <<EOF
Read these files first and follow them strictly:
- ${coord_dir}/protocol.md
- ${coord_dir}/decisions.md
- ${task_file}

Operational constraints:
- Edit only the owned paths assigned in the task card.
- Keep ${status_file} updated as you work.
- Record blockers and integration notes in ${coord_dir}/handoffs/${role}.md.
- Do not revert changes made by others.

Start by reading the files above, then execute the task in this worktree.
EOF

  write_status "${status_file}" "execute" "running" "Launching Codex worker"
  exec ${codex_cmd} "$(cat "${prompt_file}")"
}

main "$@"

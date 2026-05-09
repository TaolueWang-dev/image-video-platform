#!/usr/bin/env bash

set -euo pipefail

coord_dir() {
  local base common_dir repo_root repo_name
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    base="$(git rev-parse --show-toplevel)"
    common_dir="$(git rev-parse --git-common-dir 2>/dev/null || true)"
    if [[ -n "${common_dir}" ]]; then
      if [[ "${common_dir}" != /* ]]; then
        common_dir="$(cd "${base}" && cd "${common_dir}" && pwd)"
      fi
      repo_root="$(cd "${common_dir}/.." && pwd)"
    else
      repo_root="${base}"
    fi
  else
    repo_root="$(pwd)"
  fi
  repo_name="$(basename "${repo_root}")"
  printf '%s/%s.coordination\n' "$(cd "${repo_root}/.." && pwd)" "${repo_name}"
}

print_heading() {
  printf '\n== %s ==\n' "$1"
}

show_status() {
  local coord="$1"
  local file
  print_heading "Status"
  if [[ ! -d "${coord}/status" ]]; then
    echo "missing ${coord}/status"
    return
  fi
  for file in "${coord}/status"/*.json; do
    [[ -e "${file}" ]] || continue
    if command -v jq >/dev/null 2>&1; then
      jq -r '"- " + (input_filename | split("/") | last | sub("\\.json$"; "")) + ": " + .phase + " / " + .state + " [" + .updated_at + "] " + (.note // "")' "${file}"
    else
      echo "- $(basename "${file}")"
      sed -n '1,120p' "${file}"
    fi
  done
}

show_tasks() {
  local coord="$1"
  local file
  print_heading "Tasks"
  for file in "${coord}/tasks"/*.md; do
    [[ -e "${file}" ]] || continue
    echo "--- $(basename "${file}") ---"
    sed -n '1,60p' "${file}"
  done
}

show_handoffs() {
  local coord="$1"
  local file
  print_heading "Handoffs"
  for file in "${coord}/handoffs"/*.md; do
    [[ -e "${file}" ]] || continue
    echo "--- $(basename "${file}") ---"
    sed -n '1,60p' "${file}"
  done
}

main() {
  local coord
  coord="${1:-$(coord_dir)}"

  echo "coordination dir: ${coord}"
  if [[ -f "${coord}/protocol.md" ]]; then
    print_heading "Protocol"
    sed -n '1,80p' "${coord}/protocol.md"
  fi
  if [[ -f "${coord}/decisions.md" ]]; then
    print_heading "Decisions"
    sed -n '1,80p' "${coord}/decisions.md"
  fi
  show_status "${coord}"
  show_tasks "${coord}"
  show_handoffs "${coord}"
}

main "$@"

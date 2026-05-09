#!/usr/bin/env bash

set -euo pipefail

coord_dir() {
  local root common_dir repo_root name parent
  root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  common_dir="$(git rev-parse --git-common-dir 2>/dev/null || true)"
  if [[ -n "${common_dir}" ]]; then
    if [[ "${common_dir}" != /* ]]; then
      common_dir="$(cd "${root}" && cd "${common_dir}" && pwd)"
    fi
    repo_root="$(cd "${common_dir}/.." && pwd)"
  else
    repo_root="${root}"
  fi
  name="$(basename "${repo_root}")"
  parent="$(cd "${repo_root}/.." && pwd)"
  printf '%s/%s.coordination\n' "${parent}" "${name}"
}

main() {
  local coord status_dir file
  coord="${1:-$(coord_dir)}"
  status_dir="${coord}/status"

  if [[ ! -d "${status_dir}" ]]; then
    echo "no status directory: ${status_dir}" >&2
    exit 1
  fi

  for file in "${status_dir}"/*.json; do
    [[ -e "${file}" ]] || continue
    if command -v jq >/dev/null 2>&1; then
      jq -r '"\(.phase)\t\(.state)\t\(.updated_at)\t" + input_filename + "\t" + (.note // "")' "${file}"
    else
      printf '%s\n' "${file}"
      sed -n '1,120p' "${file}"
    fi
  done
}

main "$@"

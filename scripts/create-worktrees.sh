#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/create-worktrees.sh --role ROLE [--role ROLE...]
  scripts/create-worktrees.sh --worker 'ROLE:PATHS:DELIVERABLES:CHECKS' [--worker ...]
EOF
}

require_git_repo() {
  if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
    echo "error: create-worktrees.sh requires a git repository" >&2
    exit 1
  fi
}

has_head() {
  git rev-parse --verify HEAD >/dev/null 2>&1
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

copy_template_if_missing() {
  local src="$1"
  local dst="$2"
  if [[ -f "${src}" && ! -f "${dst}" ]]; then
    cp "${src}" "${dst}"
  fi
}

bootstrap_commit_from_worktree() {
  local root temp_dir index_file tree commit
  root="$(repo_root)"
  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/create-worktrees.XXXXXX")"
  index_file="${temp_dir}/index"

  (
    cd "${root}"
    GIT_INDEX_FILE="${index_file}" git add -A --all -- . >/dev/null
    tree="$(GIT_INDEX_FILE="${index_file}" git write-tree)"
    commit="$(
      GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Codex}" \
      GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-codex@example.invalid}" \
      GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-Codex}" \
      GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-codex@example.invalid}" \
      git commit-tree "${tree}" -m "bootstrap worktree base"
    )"
    printf '%s\n' "${commit}"
  )

  rm -rf "${temp_dir}"
}

main() {
  local -a roles=()
  local -a worker_specs=()
  local role spec branch target root coord worktrees base_ref

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --role)
        roles+=("$2")
        shift 2
        ;;
      --worker)
        worker_specs+=("$2")
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

  if [[ ${#worker_specs[@]} -gt 0 ]]; then
    for spec in "${worker_specs[@]}"; do
      role="${spec%%:*}"
      if [[ -n "${role}" && "${role}" != "${spec}" ]]; then
        roles+=("${role}")
      fi
    done
  fi

  if [[ ${#roles[@]} -eq 0 ]]; then
    echo "error: at least one --role or --worker is required" >&2
    exit 1
  fi

  require_git_repo

  root="$(repo_root)"
  coord="$(coord_dir)"
  worktrees="$(worktrees_root)"
  base_ref="HEAD"

  if ! has_head; then
    base_ref="$(bootstrap_commit_from_worktree)"
    echo "info: repository has no HEAD; bootstrapping worktrees from current working tree snapshot ${base_ref}" >&2
  fi

  mkdir -p "${coord}/tasks" "${coord}/status" "${coord}/handoffs" "${coord}/patterns" "${worktrees}"
  copy_template_if_missing "${root}/coordination-templates/protocol.md" "${coord}/protocol.md"
  copy_template_if_missing "${root}/coordination-templates/decisions.md" "${coord}/decisions.md"

  for role in "${roles[@]}"; do
    branch="worker/${role}"
    target="${worktrees}/${role}"

    if git worktree list --porcelain | grep -Fqx "worktree ${target}"; then
      echo "worktree exists: ${target}"
      continue
    fi

    if [[ -d "${target}" && -n "$(find "${target}" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true)" ]]; then
      echo "error: target directory already exists and is not empty: ${target}" >&2
      exit 1
    fi

    mkdir -p "${target}"
    git worktree add -B "${branch}" "${target}" "${base_ref}"
    echo "created ${role} -> ${target} (${branch})"
  done
}

main "$@"

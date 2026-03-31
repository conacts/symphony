#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <workspace-path>" >&2
  exit 1
}

resolve_dir() {
  local dir_path="$1"

  if [ ! -d "$dir_path" ]; then
    echo "Directory does not exist: $dir_path" >&2
    exit 1
  fi

  (
    cd "$dir_path"
    pwd -P
  )
}

resolve_source_repo() {
  local workspace_path="$1"
  local git_common_dir=""

  if [ -n "${SYMPHONY_SOURCE_REPO:-}" ] && [ -d "${SYMPHONY_SOURCE_REPO:-}" ]; then
    resolve_dir "$SYMPHONY_SOURCE_REPO"
    return 0
  fi

  if [ -n "${COLDETS_SYMPHONY_SOURCE_REPO:-}" ] && [ -d "${COLDETS_SYMPHONY_SOURCE_REPO:-}" ]; then
    resolve_dir "$COLDETS_SYMPHONY_SOURCE_REPO"
    return 0
  fi

  git_common_dir="$(git -C "$workspace_path" rev-parse --path-format=absolute --git-common-dir)"
  dirname "$git_common_dir"
}

workspace_path="${1:-}"

if [ -z "$workspace_path" ]; then
  usage
fi

if [ ! -d "$workspace_path" ]; then
  exit 0
fi

source_repo="$(resolve_source_repo "$workspace_path")"
workspace_path="$(resolve_dir "$workspace_path")"

cd "$source_repo"
git worktree remove --force "$workspace_path"
git worktree prune

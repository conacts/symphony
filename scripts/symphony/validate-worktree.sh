#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <workspace-path> <issue-identifier>" >&2
  exit 1
}

fail() {
  echo "$1" >&2
  exit 1
}

resolve_dir() {
  local dir_path="$1"

  if [ ! -d "$dir_path" ]; then
    fail "Directory does not exist: $dir_path"
  fi

  (
    cd "$dir_path"
    pwd -P
  )
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "Required command not found: $command_name"
  fi
}

workspace_path="${1:-}"
issue_identifier="${2:-${SYMPHONY_ISSUE_IDENTIFIER:-${COLDETS_SYMPHONY_ISSUE_IDENTIFIER:-}}}"

if [ -z "$workspace_path" ] || [ -z "$issue_identifier" ]; then
  usage
fi

if [ -z "${SYMPHONY_SOURCE_REPO:-${COLDETS_SYMPHONY_SOURCE_REPO:-}}" ]; then
  fail "SYMPHONY_SOURCE_REPO is required."
fi

require_command git

source_repo="$(resolve_dir "${SYMPHONY_SOURCE_REPO:-${COLDETS_SYMPHONY_SOURCE_REPO:-}}")"
workspace_path="$(resolve_dir "$workspace_path")"
expected_branch="symphony/$issue_identifier"
metadata_path="$workspace_path/.symphony/workspace.env"

if [ "$workspace_path" = "$source_repo" ]; then
  fail "Workspace path must not equal the source repo root: $workspace_path"
fi

if [ ! -f "$metadata_path" ]; then
  fail "Missing Symphony workspace metadata at $metadata_path"
fi

if ! git -C "$workspace_path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "Workspace is not a git checkout: $workspace_path"
fi

workspace_git_dir="$(git -C "$workspace_path" rev-parse --path-format=absolute --git-dir)"
workspace_common_dir="$(git -C "$workspace_path" rev-parse --path-format=absolute --git-common-dir)"
source_common_dir="$(git -C "$source_repo" rev-parse --path-format=absolute --git-common-dir)"
workspace_branch="$(git -C "$workspace_path" rev-parse --abbrev-ref HEAD)"
worktree_registered=0
listed_path=""

if [ "$workspace_git_dir" = "$workspace_common_dir" ]; then
  fail "Workspace is not a linked git worktree: $workspace_path"
fi

if [ "$workspace_common_dir" != "$source_common_dir" ]; then
  fail "Workspace is attached to a different git common dir than the Symphony source repo."
fi

while IFS= read -r listed_path; do
  if [ -n "$listed_path" ] && [ "$(resolve_dir "$listed_path")" = "$workspace_path" ]; then
    worktree_registered=1
    break
  fi
done < <(git -C "$source_repo" worktree list --porcelain | awk '/^worktree /{print substr($0,10)}')

if [ "$worktree_registered" -ne 1 ]; then
  fail "Workspace is not registered as a git worktree in the Symphony source repo: $workspace_path"
fi

if [ "$workspace_branch" != "$expected_branch" ]; then
  fail "Workspace branch mismatch. Expected $expected_branch but found $workspace_branch."
fi

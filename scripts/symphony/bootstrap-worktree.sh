#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <workspace-path> <issue-identifier>" >&2
  exit 1
}

log_step() {
  printf '[symphony-bootstrap] %s\n' "$*"
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

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
}

bool_env_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

fetch_remote_refs() {
  local source_repo="$1"

  if git -C "$source_repo" remote get-url origin >/dev/null 2>&1; then
    git -C "$source_repo" fetch origin --prune
  fi
}

resolve_default_base_ref() {
  local source_repo="$1"
  local remote_head=""

  if [ -n "${SYMPHONY_BASE_REF:-}" ]; then
    printf '%s\n' "$SYMPHONY_BASE_REF"
    return 0
  fi

  if [ -n "${COLDETS_SYMPHONY_BASE_REF:-}" ]; then
    printf '%s\n' "$COLDETS_SYMPHONY_BASE_REF"
    return 0
  fi

  remote_head="$(git -C "$source_repo" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  if [ -n "$remote_head" ]; then
    printf '%s\n' "$remote_head"
    return 0
  fi

  if git -C "$source_repo" show-ref --verify --quiet refs/remotes/origin/main; then
    printf '%s\n' "origin/main"
    return 0
  fi

  printf '%s\n' "HEAD"
}

source_repo_has_untracked_files() {
  local source_repo="$1"

  [ -n "$(git -C "$source_repo" ls-files --others --exclude-standard)" ]
}

source_repo_has_local_changes() {
  local source_repo="$1"

  ! git -C "$source_repo" diff --quiet HEAD -- || source_repo_has_untracked_files "$source_repo"
}

ensure_source_repo_ready() {
  local source_repo="$1"

  if bool_env_true "${SYMPHONY_OVERLAY_SOURCE_DIFFS:-${COLDETS_SYMPHONY_OVERLAY_SOURCE_DIFFS:-0}}"; then
    return 0
  fi

  if source_repo_has_local_changes "$source_repo"; then
    echo "Source repo has uncommitted changes. Commit/stash them first or set SYMPHONY_OVERLAY_SOURCE_DIFFS=1 to intentionally copy them into new worktrees." >&2
    exit 1
  fi
}

overlay_tracked_changes() {
  local source_repo="$1"
  local workspace_path="$2"

  if git -C "$source_repo" diff --quiet HEAD --; then
    return 0
  fi

  git -C "$source_repo" diff --binary HEAD -- | git -C "$workspace_path" apply --allow-empty --whitespace=nowarn
}

overlay_untracked_files() {
  local source_repo="$1"
  local workspace_path="$2"
  local relative_path=""

  while IFS= read -r -d '' relative_path; do
    mkdir -p "$workspace_path/$(dirname "$relative_path")"
    rm -f "$workspace_path/$relative_path"
    cp -a "$source_repo/$relative_path" "$workspace_path/$relative_path"
  done < <(git -C "$source_repo" ls-files --others --exclude-standard -z)
}

workspace_path="${1:-}"
issue_identifier="${2:-${SYMPHONY_ISSUE_IDENTIFIER:-${COLDETS_SYMPHONY_ISSUE_IDENTIFIER:-}}}"

if [ -z "$workspace_path" ] || [ -z "$issue_identifier" ]; then
  usage
fi

if [ -z "${SYMPHONY_SOURCE_REPO:-${COLDETS_SYMPHONY_SOURCE_REPO:-}}" ]; then
  echo "SYMPHONY_SOURCE_REPO is required." >&2
  exit 1
fi

require_command git

source_repo="$(resolve_dir "${SYMPHONY_SOURCE_REPO:-${COLDETS_SYMPHONY_SOURCE_REPO:-}}")"
workspace_parent="$(dirname "$workspace_path")"
branch_name="symphony/$issue_identifier"
base_ref=""
install_cmd="${SYMPHONY_INSTALL_CMD:-${COLDETS_SYMPHONY_INSTALL_CMD:-pnpm install}}"
worktree_created=0
branch_created=0

cleanup_failed_bootstrap() {
  local exit_code="$?"

  if [ "$exit_code" -eq 0 ] || [ "${worktree_created:-0}" -ne 1 ]; then
    return
  fi

  echo "Bootstrap failed; removing partial worktree at $workspace_path" >&2
  git -C "$source_repo" worktree remove --force "$workspace_path" >/dev/null 2>&1 || true
  if [ "${branch_created:-0}" -eq 1 ] && git -C "$source_repo" show-ref --verify --quiet "refs/heads/$branch_name"; then
    git -C "$source_repo" branch -D "$branch_name" >/dev/null 2>&1 || true
  fi
  git -C "$source_repo" worktree prune >/dev/null 2>&1 || true
}

trap cleanup_failed_bootstrap EXIT

mkdir -p "$workspace_parent"
log_step "fetching latest refs for source repo $source_repo"
fetch_remote_refs "$source_repo"
ensure_source_repo_ready "$source_repo"
base_ref="$(resolve_default_base_ref "$source_repo")"

if git -C "$source_repo" show-ref --verify --quiet "refs/heads/$branch_name"; then
  log_step "adding existing worktree $workspace_path on branch $branch_name"
  git -C "$source_repo" worktree add "$workspace_path" "$branch_name"
else
  log_step "creating worktree $workspace_path from $base_ref on branch $branch_name"
  git -C "$source_repo" worktree add -b "$branch_name" "$workspace_path" "$base_ref"
  branch_created=1
fi
worktree_created=1

if bool_env_true "${SYMPHONY_OVERLAY_SOURCE_DIFFS:-${COLDETS_SYMPHONY_OVERLAY_SOURCE_DIFFS:-0}}"; then
  overlay_tracked_changes "$source_repo" "$workspace_path"
  overlay_untracked_files "$source_repo" "$workspace_path"
fi

if [ -n "$install_cmd" ]; then
  log_step "installing workspace dependencies in $workspace_path"
  (
    cd "$workspace_path"
    bash -lc "$install_cmd"
  )
fi

log_step "rendering workspace metadata in $workspace_path"
"$source_repo/scripts/symphony/render-workspace-env.sh" "$workspace_path" "$issue_identifier"

log_step "workspace bootstrap completed for $workspace_path"

trap - EXIT

#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <workspace-path> <issue-identifier>" >&2
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

workspace_path="${1:-}"
issue_identifier="${2:-${SYMPHONY_ISSUE_IDENTIFIER:-${COLDETS_SYMPHONY_ISSUE_IDENTIFIER:-}}}"

if [ -z "$workspace_path" ] || [ -z "$issue_identifier" ]; then
  usage
fi

workspace_path="$(resolve_dir "$workspace_path")"
source_repo="$(resolve_dir "${SYMPHONY_SOURCE_REPO:-${COLDETS_SYMPHONY_SOURCE_REPO:-$workspace_path}}")"

mkdir -p "$workspace_path/.symphony"

cat >"$workspace_path/.symphony/workspace.env" <<EOF
SYMPHONY_ISSUE_IDENTIFIER=$issue_identifier
COLDETS_SYMPHONY_ISSUE_IDENTIFIER=$issue_identifier
SYMPHONY_SOURCE_REPO=$source_repo
COLDETS_SYMPHONY_SOURCE_REPO=$source_repo
SYMPHONY_WORKSPACE_PATH=$workspace_path
SYMPHONY_WORKSPACE_ROOT=$(dirname "$workspace_path")
EOF

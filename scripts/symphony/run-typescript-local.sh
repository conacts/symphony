#!/usr/bin/env bash
set -euo pipefail

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
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

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(resolve_dir "$SCRIPT_DIR/../..")"

require_command pnpm

export WORKFLOW_PATH="${WORKFLOW_PATH:-$REPO_ROOT/WORKFLOW.md}"
export SYMPHONY_RUN_JOURNAL_FILE="${SYMPHONY_RUN_JOURNAL_FILE:-$REPO_ROOT/.symphony/run-journal.json}"

cd "$REPO_ROOT"
exec pnpm --filter @symphony/runtime dev

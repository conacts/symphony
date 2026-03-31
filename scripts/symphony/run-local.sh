#!/usr/bin/env bash
set -euo pipefail

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
}

require_env() {
  local variable_name="$1"

  if [ -z "${!variable_name:-}" ]; then
    echo "Missing required environment variable: $variable_name" >&2
    exit 1
  fi
}

symfony_binary_is_stale() {
  local install_root="$1"
  local binary_path="$install_root/bin/symphony"
  local -a build_inputs=(
    "$install_root/lib"
    "$install_root/config"
    "$install_root/mix.exs"
    "$install_root/mix.lock"
    "$install_root/mise.toml"
  )
  local input_path=""

  if [ ! -e "$binary_path" ]; then
    return 0
  fi

  for input_path in "${build_inputs[@]}"; do
    if [ -d "$input_path" ]; then
      if find "$input_path" -type f -newer "$binary_path" -print -quit | grep -q .; then
        return 0
      fi
    elif [ -f "$input_path" ] && [ "$input_path" -nt "$binary_path" ]; then
      return 0
    fi
  done

  return 1
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
WORKFLOW_PATH="$REPO_ROOT/WORKFLOW.md"
DEFAULT_SYMPHONY_INSTALL_ROOT="$REPO_ROOT/symphony/elixir"

export SYMPHONY_SOURCE_REPO="${SYMPHONY_SOURCE_REPO:-${COLDETS_SYMPHONY_SOURCE_REPO:-$REPO_ROOT}}"
export COLDETS_SYMPHONY_SOURCE_REPO="$SYMPHONY_SOURCE_REPO"
export SYMPHONY_WORKSPACE_ROOT="${SYMPHONY_WORKSPACE_ROOT:-$HOME/code/workspaces/symphony}"
export SYMPHONY_INSTALL_ROOT="${SYMPHONY_INSTALL_ROOT:-$DEFAULT_SYMPHONY_INSTALL_ROOT}"

require_env LINEAR_API_KEY
require_command codex
require_command gh
require_command mise

if [ ! -f "$HOME/.codex/auth.json" ]; then
  echo "Warning: ~/.codex/auth.json was not found; make sure Codex auth is available through another mechanism." >&2
fi

if [ ! -f "$WORKFLOW_PATH" ]; then
  echo "Workflow file not found: $WORKFLOW_PATH" >&2
  exit 1
fi

if [ ! -d "$SYMPHONY_INSTALL_ROOT" ]; then
  echo "Symphony install root not found: $SYMPHONY_INSTALL_ROOT" >&2
  exit 1
fi

if [ ! -x "$SYMPHONY_INSTALL_ROOT/bin/symphony" ]; then
  echo "Symphony binary not found or not executable: $SYMPHONY_INSTALL_ROOT/bin/symphony" >&2
  echo "Build it with: (cd \"$SYMPHONY_INSTALL_ROOT\" && mise exec -- mix setup && mise exec -- mix build)" >&2
  exit 1
fi

if symfony_binary_is_stale "$SYMPHONY_INSTALL_ROOT"; then
  echo "Symphony binary is stale relative to source files under $SYMPHONY_INSTALL_ROOT." >&2
  echo "Rebuild it with: (cd \"$SYMPHONY_INSTALL_ROOT\" && mise exec -- mix setup && mise exec -- mix build)" >&2
  exit 1
fi

mkdir -p "$SYMPHONY_WORKSPACE_ROOT"

cd "$SYMPHONY_INSTALL_ROOT"
exec mise exec -- ./bin/symphony \
  "$WORKFLOW_PATH" \
  --i-understand-that-this-will-be-running-without-the-usual-guardrails \
  "$@"

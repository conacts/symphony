#!/usr/bin/env bash
set -eo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
project_root="$repo_root"

if [ ! -f "$project_root/package.json" ]; then
  echo "Expected package.json at $project_root" >&2
  exit 1
fi

cd "$project_root"

if command -v mise >/dev/null 2>&1; then
  mise trust
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
  fi
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required to initialize this worktree. Install pnpm or enable Corepack first." >&2
  exit 1
fi

pnpm install --frozen-lockfile

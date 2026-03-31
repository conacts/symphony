#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"

cd "$REPO_ROOT"
exec pnpm exec turbo run build lint test typecheck \
  --filter=@symphony/env \
  --filter=@symphony/errors \
  --filter=@symphony/contracts \
  --filter=@symphony/core \
  --filter=@symphony/runtime \
  --filter=@symphony/dashboard

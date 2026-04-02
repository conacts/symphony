#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOCKERFILE_PATH="$ROOT_DIR/docker/workspace-runner/Dockerfile"
DEFAULT_IMAGE="symphony/workspace-runner:local"
IMAGE_NAME="${SYMPHONY_DOCKER_WORKSPACE_IMAGE:-$DEFAULT_IMAGE}"

usage() {
  cat <<'EOF'
Usage: ./scripts/docker/build-workspace-runner.sh [--no-cache] [--print-image]

Builds the supported local Symphony Docker workspace runner image.

Options:
  --no-cache     Rebuild from scratch.
  --print-image  Print the image name Symphony will use locally and exit.
EOF
}

NO_CACHE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-cache)
      NO_CACHE=1
      shift
      ;;
    --print-image)
      printf '%s\n' "$IMAGE_NAME"
      exit 0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
done

BUILD_ARGS=(
  build
  --file "$DOCKERFILE_PATH"
  --tag "$IMAGE_NAME"
  "$ROOT_DIR/docker/workspace-runner"
)

if [[ "$NO_CACHE" -eq 1 ]]; then
  BUILD_ARGS=(build --no-cache --file "$DOCKERFILE_PATH" --tag "$IMAGE_NAME" "$ROOT_DIR/docker/workspace-runner")
fi

echo "Building Symphony workspace runner image: $IMAGE_NAME"
docker "${BUILD_ARGS[@]}"

cat <<EOF

Built $IMAGE_NAME

Supported local Docker-first path:
  export SYMPHONY_WORKSPACE_BACKEND=docker
  pnpm --filter @symphony/api dev

Optional override:
  export SYMPHONY_DOCKER_WORKSPACE_IMAGE=$IMAGE_NAME
EOF

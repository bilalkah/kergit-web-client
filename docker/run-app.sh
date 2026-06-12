#!/usr/bin/env bash
set -euo pipefail

DETACHED=0
BUILD=0
SERVICE_NAME="nuxt-web-dev"
IMAGE_NAME="web-base:latest"

for arg in "$@"; do
  case "$arg" in
    --detached)
      DETACHED=1
      ;;
    --build)
      BUILD=1
      ;;
    --prod)
      SERVICE_NAME="nuxt-web-prod"
      ;;
    *)
      echo "❌ Unknown argument: $arg"
      echo "Usage: $0 [--detached] [--build] [--prod]"
      exit 1
      ;;
  esac
done

# docker/ → web/ → clients/ → project/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-kergit-web}"
ENV_FILE="$REPO_ROOT/.env"

COMPOSE_ARGS=(-p "$PROJECT_NAME" -f "$COMPOSE_FILE")

if [ -f "$ENV_FILE" ]; then
  COMPOSE_ARGS=(--env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}")
fi

# Shared network for Caddy -> web-app-container resolution.
docker network inspect kergit_default >/dev/null 2>&1 || docker network create kergit_default >/dev/null 2>&1 || true

# ---- stop previous web service before switching mode ------
docker compose "${COMPOSE_ARGS[@]}" down --remove-orphans >/dev/null 2>&1 || true
# Clean both current and legacy container names to avoid name conflicts.
docker rm -f web-app-container web-dev-container nuxt-dev-container nuxt-prod-container >/dev/null 2>&1 || true

if [ "$BUILD" -eq 1 ] || ! docker inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  docker compose "${COMPOSE_ARGS[@]}" build "$SERVICE_NAME"
fi

if [ "$DETACHED" -eq 1 ]; then
  docker compose "${COMPOSE_ARGS[@]}" up -d --remove-orphans "$SERVICE_NAME"
else
  docker compose "${COMPOSE_ARGS[@]}" up --remove-orphans "$SERVICE_NAME"
fi

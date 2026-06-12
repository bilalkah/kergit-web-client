#!/usr/bin/env bash
set -euo pipefail

DEV_CONTAINER_NAME=web-app-container
LEGACY_DEV_CONTAINER_NAME=nuxt-dev-container
PROD_CONTAINER_NAME=nuxt-prod-container
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-kergit-web}"
ENV_FILE="$REPO_ROOT/.env"
COMPOSE_ARGS=(-p "$PROJECT_NAME" -f "$COMPOSE_FILE")

if [ -f "$ENV_FILE" ]; then
  COMPOSE_ARGS=(--env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}")
fi

docker compose "${COMPOSE_ARGS[@]}" down --remove-orphans >/dev/null 2>&1 || true

docker rm -f "$DEV_CONTAINER_NAME" "$LEGACY_DEV_CONTAINER_NAME" "$PROD_CONTAINER_NAME" >/dev/null 2>&1 || true

echo "✅ Nuxt web container stopped and removed"

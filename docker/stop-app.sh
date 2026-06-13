#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-kergit-web}"
DEV_CONTAINER_NAME="${PROJECT_NAME}-web-node-dev-1"
PROD_CONTAINER_NAME="${PROJECT_NAME}-web-node-prod-1"
LEGACY_DEV_CONTAINER_NAME=nuxt-dev-container
ENV_FILE="$REPO_ROOT/.env"
COMPOSE_ARGS=(-p "$PROJECT_NAME" -f "$COMPOSE_FILE")

if [ -f "$ENV_FILE" ]; then
  COMPOSE_ARGS=(--env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}")
fi

docker compose "${COMPOSE_ARGS[@]}" down --remove-orphans >/dev/null 2>&1 || true

docker rm -f "$DEV_CONTAINER_NAME" "$PROD_CONTAINER_NAME" web-node web-app-container \
  web-dev-container "$LEGACY_DEV_CONTAINER_NAME" nuxt-prod-container >/dev/null 2>&1 || true

echo "✅ Nuxt web container stopped and removed"

#!/usr/bin/env bash
set -e

# Go to repo root relative to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load root .env if present
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  source "$REPO_ROOT/.env"
  set +a
fi

WEB_ROOT="$REPO_ROOT/clients/web"

# Go to Nuxt app
cd "$WEB_ROOT"

# Ensure pnpm exists
command -v pnpm >/dev/null || {
  echo "❌ pnpm not found"
  exit 1
}

# Install deps if needed
[ -d node_modules ] || pnpm install

./docker/generate-proto.sh

# Run Nuxt
exec pnpm dev

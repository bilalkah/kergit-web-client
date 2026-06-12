#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [ -d /app/clients/web ] && [ -d /app/proto ]; then
  APP_ROOT="/app"
else
  APP_ROOT="$REPO_ROOT"
fi

WEB_ROOT="$APP_ROOT/clients/web"
PROTO_ROOT="$APP_ROOT/proto"
GEN_DIR="$WEB_ROOT/src/generated/proto"

if [ ! -d "$PROTO_ROOT" ]; then
  echo "❌ proto directory missing: $PROTO_ROOT"
  exit 1
fi

rm -rf "$GEN_DIR"
mkdir -p "$GEN_DIR"

ALL_PROTO_FILES=()
while IFS= read -r proto_file; do
  ALL_PROTO_FILES+=("$proto_file")
done < <(find "$PROTO_ROOT" -type f -name '*.proto' | sort)
if [ "${#ALL_PROTO_FILES[@]}" -eq 0 ]; then
  echo "❌ no .proto files found in $PROTO_ROOT"
  exit 1
fi

TMP_ALL="$(mktemp)"
TMP_IMPORTED="$(mktemp)"
trap 'rm -f "$TMP_ALL" "$TMP_IMPORTED"' EXIT

printf '%s\n' "${ALL_PROTO_FILES[@]}" > "$TMP_ALL"

grep -hE '^[[:space:]]*import[[:space:]]+"' "${ALL_PROTO_FILES[@]}" \
  | sed -E 's/^[[:space:]]*import[[:space:]]+"([^"]+)".*/\1/' \
  | sed "s#^#$APP_ROOT/#" \
  | sort -u > "$TMP_IMPORTED" || true

ROOT_PROTO_FILES=()
while IFS= read -r proto_file; do
  ROOT_PROTO_FILES+=("$proto_file")
done < <(comm -23 "$TMP_ALL" "$TMP_IMPORTED")
if [ "${#ROOT_PROTO_FILES[@]}" -eq 0 ]; then
  echo "❌ no root proto files found to generate from"
  exit 1
fi

cd "$WEB_ROOT"

echo "▶ Generating static protobuf module..."
pnpm exec pbjs \
  -t static-module \
  -w es6 \
  --keep-case \
  -p "$APP_ROOT" \
  -o "$GEN_DIR/proto.js" \
  "${ROOT_PROTO_FILES[@]}"

pnpm exec pbts \
  -o "$GEN_DIR/proto.d.ts" \
  "$GEN_DIR/proto.js"

PROTOBUF_MIN_JS="$(node -p "require.resolve('protobufjs/dist/minimal/protobuf.min.js')")"
cp "$PROTOBUF_MIN_JS" "$GEN_DIR/protobuf.noeval.cjs"

node - "$GEN_DIR/protobuf.noeval.cjs" <<'NODE'
const fs = require('fs')
const file = process.argv[2]
const src = fs.readFileSync(file, 'utf8')

fs.writeFileSync(file, src.replace(/\/\/# sourceMappingURL=.*(?:\r?\n)?$/, ''))
NODE

cat > "$GEN_DIR/protobuf-noeval-runtime.js" <<'EOF'
import './protobuf.noeval.cjs'

if (!globalThis.protobuf) {
  throw new Error('protobuf runtime failed to initialize')
}

export default globalThis.protobuf
EOF

node - "$GEN_DIR/proto.js" <<'NODE'
const fs = require('fs')
const file = process.argv[2]
const src = fs.readFileSync(file, 'utf8')
const target = 'import $protobuf from "protobufjs/minimal.js";'
const replacement = 'import $protobuf from "./protobuf-noeval-runtime.js";'

if (!src.includes(target)) {
  throw new Error(`expected protobufjs import not found in ${file}`)
}

fs.writeFileSync(file, src.replace(target, replacement))
NODE

if grep -Eq 'eval\(|new Function\(' "$GEN_DIR/proto.js" "$GEN_DIR/protobuf.noeval.cjs"; then
  echo "❌ eval/function generation markers detected in generated protobuf runtime"
  exit 1
fi

node --input-type=module - "$GEN_DIR/proto.js" <<'NODE'
import { pathToFileURL } from 'node:url'

const file = process.argv[2]
const { sercom } = await import(pathToFileURL(file).href)
const Envelope = sercom.protocol.Envelope
const encoded = Envelope.encode(
  Envelope.create({ version: 1, type: Envelope.Type.AUTH_OK })
).finish()
const decoded = Envelope.decode(encoded)

if (decoded.version !== 1 || decoded.type !== Envelope.Type.AUTH_OK) {
  throw new Error('generated protobuf envelope round-trip failed')
}
NODE

echo "✅ Generated protobuf files in $GEN_DIR"

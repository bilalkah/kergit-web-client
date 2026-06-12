# Kergit Web Client

User-facing Nuxt 4 / Vue 3 client for Kergit chat, presence, browser auth, and
LiveKit voice/media controls.

This is an advanced prototype, not a production-ready client.

## Backend Connection

- Protobuf messages are exchanged with the C++ backend over WebSocket.
- Same-origin Nuxt server routes handle Supabase-backed browser sessions.
- LiveKit handles media after the backend authorizes a voice join and issues a token.

The full root stack exposes the client through Caddy at the root `WEB_DOMAIN`.

## Environment

Configure the repo-root `.env`. Required values are:

- `NUXT_PUBLIC_SUPABASE_URL`
- `NUXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for attachment and server-side admin operations

The repo-root `.env` is the only configuration source for monorepo development.

## Development

From the repo root:

```bash
./clients/web/docker/run-app.sh --detached
```

For direct development from `clients/web/`, configure the repo-root `.env`, then run:

```bash
pnpm install
./run_nuxt_dev.sh
```

`run_nuxt_dev.sh` generates the protobuf client before starting Nuxt. For
manual generation, run:

```bash
./docker/generate-proto.sh
```

Generated files live in `src/generated/proto/` and are intentionally gitignored.

## Test and Build

```bash
pnpm install
./docker/generate-proto.sh
pnpm test
pnpm build
```

## Known Limitations

- Voice/video, screen sharing, and reconnect edge cases still need broader validation.
- Direct development still requires the repo-root protobuf sources.
- The client depends on configured Supabase, backend WebSocket, and LiveKit services
  for complete flows.

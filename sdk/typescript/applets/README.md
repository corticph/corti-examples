# Corti SDK Applets

A set of runnable example applets for the Corti Speech-to-Text APIs. Each applet demonstrates one integration concept in isolation — dictation, ambient transcription, agentic workflows, and more.

## Prerequisites

- Node.js 18+
- A Corti tenant and OAuth client credentials (client ID + secret). Contact Corti support or your account team if you need test credentials.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure credentials

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

```
CORTI_CLIENT_ID=<your-client-id>
CORTI_CLIENT_SECRET=<your-client-secret>
CORTI_ENVIRONMENT=<environment>  # e.g. dev-weu, staging-eu
CORTI_TENANT_NAME=<tenant-name>
```

> **Never commit `.env`.** The `.gitignore` already excludes all `.env*` files.

### 3. Start the dev server

```bash
npm run dev
```

The app opens at [http://localhost:8080](http://localhost:8080). The Express server and Vite dev server share one port — no separate terminal needed.

## How it works

### Auth flow

Credentials stay on the server. The browser never holds the client secret or full-scope tokens.

1. On startup, the browser fetches `GET /api/config` — returns `{ cluster, tenant, clientId }`.
2. The browser POSTs to `/api/auth/stream-token` to receive a short-lived, streaming-scoped bearer token.
3. The token auto-refreshes ~30 seconds before it expires.

WebSocket endpoints (`/transcribe`, `/streams`) use the streaming token. REST calls go through the `/api/corti` proxy, which injects a full-scope server-side token transparently.

### `AppletAuthProvider` pattern

Every applet relies on `AppletAuthProvider` from `src/applets/_shared/auth-context.tsx` instead of reaching for credentials directly.

`App.tsx` sits at the top of the tree and feeds auth values into the provider:

```tsx
<AppletAuthProvider value={{ authConfig, authenticate, isReady }}>
  {/* applets rendered here */}
</AppletAuthProvider>
```

Inside any applet, `useAuth()` returns:

```ts
const { authConfig, authenticate, isReady } = useAuth();
// authConfig: { authToken, cluster, tenant, clientId }
// authenticate(): re-mint a fresh streaming token and return it
// isReady: true once first token is obtained
```

The applets never import from `useCortiAuth` directly — the host (`App.tsx`) owns auth and provides it via context. This means these applets can be embedded in any host app that wraps them with `AppletAuthProvider`.

### REST proxy

All REST API calls from the browser go to `/api/corti/*`, which the Express server proxies to `https://api.<cluster>.corti.app/` with a server-injected `Authorization` header. The `buildApiUrl()` helper in `src/applets/_shared/urls.ts` returns the correct origin-relative prefix.

### Project structure

```
src/
  applets/
    _shared/          # auth context, URL builders, shared types, shared utilities
    ambient-diarized/ # /streams endpoint with diarization
    conversational-agent/
    dictation-*/      # various /transcribe endpoint demos
    ...
    registry.ts       # APPLETS manifest — add a new applet here
  components/ui/      # shadcn/ui primitives
  lib/utils.ts        # cn() Tailwind class helper
  App.tsx             # host app: auth, sidebar navigation, applet renderer
  main.tsx            # React entry point
  useCortiAuth.ts     # auth hook (config fetch + token mint + auto-refresh)
  global.css          # Tailwind base + CSS variable tokens

server/
  index.ts            # Express factory (createServer())
  corti-token.ts      # credential + token management
  routes/auth.ts      # POST /api/auth/stream-token
  routes/proxy.ts     # /api/corti/* proxy
```

## Adding an applet

1. Create a folder under `src/applets/<your-applet>/` with at least one component.
2. Use `useAuth()` from `../_shared/auth-context` for credentials.
3. Use `buildApiUrl()` from `../_shared/urls` for REST base URLs and `buildWsBaseUrl(cluster)` for WebSocket base URLs.
4. Add an entry to the `APPLETS` array in `src/applets/registry.ts`.

## Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server + Express on http://localhost:8080 |
| `npm run build` | Build client + server bundles |
| `npm run start` | Run the production build |
| `npm run typecheck` | TypeScript type check (no emit) |

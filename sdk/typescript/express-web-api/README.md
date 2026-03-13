# Corti SDK Examples – Express Web API

A minimal **Express (TypeScript) API** that demonstrates the [`@corti/sdk`](https://www.npmjs.com/package/@corti/sdk): token, interactions, recordings, transcripts, facts, codes, templates, agents, documents, **stream**, and **transcribe** (WebSocket endpoints).

## What this example represents

This is a **server-side** reference API you can run locally. It shows how to:

- **Authenticate** — Client credentials and ROPC token endpoints; optional scopes.
- **Call Corti APIs** — Interactions (list, create, get, update, delete), recordings (list, upload sample, get, delete), transcripts (list, create from sample, get status, get, delete), facts (groups, list, create, update, batch, extract), codes (ICD-10-CM, CPT), templates, agents, documents.
- **Stream and transcribe** — WebSocket endpoints for real-time audio (TypeScript-only in this repo).

A **Postman** collection in this repo is set up for this API: import `sdk/postman/WebApi.postman_collection.json` and `sdk/postman/environments/JS.postman_environment.json`, choose the **“Web API – JS (Express)”** environment (`http://localhost:3000`), start this server, then run requests from the **Web Api** collection. See `sdk/postman/README.md` for setup.

---

## Prerequisites

- **Node.js 18+**
- **Corti account** and API credentials (tenant name, client ID, client secret) from [Corti Console](https://console.corti.app).

---

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure credentials**

   Copy the example env file and set your Corti values:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set at least:

   - `CORTI_TENANT_NAME`
   - `CORTI_CLIENT_ID`
   - `CORTI_CLIENT_SECRET`

   The app loads `.env` via `dotenv` (and `.env.local` overrides `.env` if you use it). You can also set these variables in your shell instead of using a file.

---

## Run

**Development** (with file watching):

```bash
npm run dev
```

- Server: **http://localhost:3000** (or the `PORT` you set in env).
- Change code; the process restarts automatically.

**Production:**

```bash
npm run build
npm start
```

**Lint and format:** `npm run lint` (Biome; use `npm run lint:fix` to auto-fix), `npm run format`.

---

## Endpoints (GET unless noted)

| Path | Description |
|------|-------------|
| `/token` | Raw token (client credentials); optional `?scopes=...` |
| `/token/cc` | Call Facts.FactGroupsList with client credentials |
| `/token/bearer` | Get bearer token then call Facts.FactGroupsList |
| `/token/ropc` | Raw token via ROPC (username/password); optional `?scopes=...` |
| `/token/ropc-client` | Call Facts.FactGroupsList with ROPC auth |
| `/token/ropc-refresh` | ROPC refresh token (uses env refresh token) |
| `/token/custom-refresh` | Custom refresh flow with ROPC credentials |
| `/token/auth-code-authorize` | Auth code: get authorization URL (query: redirectUri, state) |
| `/token/auth-code` | Auth code: exchange code for token (query: code, redirectUri) |
| `/token/pkce-authorize` | PKCE: get authorization URL (query: redirectUri, state) |
| `/token/pkce` | PKCE: exchange code for token (query: code, codeVerifier, redirectUri) |
| `/client-variants` | Exercise CC, ROPC, auth code, PKCE clients; call Facts.FactGroupsList per variant (query: authCode, pkceCode, pkceVerifier) |
| `/interactions` | List, create, get, update, delete interactions (query: sort, direction, pageSize, index, encounterStatus, patient) |
| `/recordings` | List, upload sample, get (download), delete recording |
| `/transcripts` | List, create transcript from sample, get status, get, delete |
| `/facts` | Fact groups, list, create, update, batch update, extract |
| `/codes` | Code prediction (ICD-10-CM, CPT) |
| `/templates` | List templates, list sections, get by key (query: org, lang, status) |
| `/agents` | List, create, get, card, registry experts, message send, get task/context, delete (query: limit, offset, ephemeral) |
| `/documents` | List, create, get, update, delete document |
| `/stream` | Stream WebSocket: create interaction (or use `?interactionId=`), send config + audio chunks + flush (query: optional `interactionId`) |
| `/transcribe` | Transcribe WebSocket: send config + audio chunks + flush |

---

## Parameters (environment)

Set Corti credentials in `.env` / `.env.local` or in the environment. Alternate names (e.g. `CORTI__TENANTNAME`) are supported for compatibility; the primary name is listed below.

### Client credentials (main)

Required for `/token`, `/token/cc`, `/token/bearer`, and most API endpoints (interactions, recordings, transcripts, facts, codes, templates, agents, documents, stream, transcribe):

| Variable | Description |
|----------|-------------|
| `CORTI_TENANT_NAME` | Your Corti tenant name |
| `CORTI_CLIENT_ID` | OAuth2 client ID (client credentials) |
| `CORTI_CLIENT_SECRET` | OAuth2 client secret |

### ROPC (resource owner password credentials)

Required for `/token/ropc`, `/token/ropc-client`, and ROPC-based client usage (e.g. in `/client-variants`):

| Variable | Description |
|----------|-------------|
| `CORTI_USERNAME` | Resource owner username |
| `CORTI_PASSWORD` | Resource owner password |
| `CORTI_ROPC_CLIENT_ID` | OAuth2 client ID for ROPC (optional; falls back to `CORTI_CLIENT_ID`) |

### PKCE (authorization code + PKCE)

Required for PKCE token endpoints and PKCE client usage (e.g. in `/client-variants`). Tenant/environment fall back to main vars if unset:

| Variable | Description |
|----------|-------------|
| `CORTI_PKCE_CLIENT_ID` | OAuth2 client ID for PKCE flow |
| `CORTI_PKCE_REDIRECT_URI` | Redirect URI registered for the PKCE client |
| `CORTI_PKCE_TENANT_NAME` | Tenant for PKCE (optional; falls back to `CORTI_TENANT_NAME`) |
| `CORTI_PKCE_ENVIRONMENT` | Environment for PKCE (optional; falls back to `CORTI_ENVIRONMENT`) |

### Auth code (authorization code with client secret)

Required for auth-code token endpoints and auth-code client usage (e.g. in `/client-variants`). Tenant/environment fall back to main vars if unset:

| Variable | Description |
|----------|-------------|
| `CORTI_AUTH_CODE_CLIENT_ID` | OAuth2 client ID for auth code flow |
| `CORTI_AUTH_CODE_CLIENT_SECRET` | OAuth2 client secret for auth code flow |
| `CORTI_AUTH_CODE_REDIRECT_URI` | Redirect URI registered for the auth code client |
| `CORTI_AUTH_CODE_TENANT_NAME` | Tenant for auth code (optional; falls back to `CORTI_TENANT_NAME`) |
| `CORTI_AUTH_CODE_ENVIRONMENT` | Environment for auth code (optional; falls back to `CORTI_ENVIRONMENT`) |

### Server and global

| Variable | Description |
|----------|-------------|
| `CORTI_ENVIRONMENT` | `us` or `eu` (default: `eu`). Used when a flow-specific env is not set. |
| `PORT` | Server port (default: 3000) |

---

## SDK

The app depends on **`@corti/sdk`**. By default it uses the **published package from npm** (see `package.json`), so `npm install` is enough and you don’t need the SDK repo.

**Optional: use a local SDK clone** when you’re working on the SDK itself (e.g. in the `corti-sdk-typescript` repo) and want this app to run against your local build instead of the published version—same idea as the .NET [local.Corti.props](../../dotnet/web-api/local.Corti.props.example).

1. Clone and build the SDK somewhere (e.g. next to this repo):
   ```bash
   cd ../../../../corti-sdk-typescript
   pnpm install && pnpm build
   ```
2. From this app’s directory, install that folder so it replaces the npm package:
   ```bash
   npm install file:../../../../corti-sdk-typescript
   ```

To use the published package again: `npm install @corti/sdk@alpha`.

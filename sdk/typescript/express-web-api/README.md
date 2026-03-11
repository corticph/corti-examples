# Corti SDK Examples – Express Web API

Minimal Express (TypeScript) API that demonstrates the Corti SDK with the same endpoints as the [.NET web-api](../../dotnet/web-api/): token, interactions, recordings, transcripts, facts, codes, templates, agents, documents. Additionally: **stream** and **transcribe** (TypeScript-only; not yet exposed in .NET).

## Prerequisites

- Node.js 18+
- Corti credentials (tenant name, client ID, client secret)

## How to run

From this directory:

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your CORTI_TENANT_NAME, CORTI_CLIENT_ID, CORTI_CLIENT_SECRET
npm run dev
```

- **Dev:** `http://localhost:3000` (or `PORT` from env)
- **Production:** `npm run build && npm start`
- **Lint:** `npm run lint` (Biome; use `npm run lint:fix` to auto-fix). **Format:** `npm run format`

## Endpoints (GET)

| Path | Description |
|------|-------------|
| `/token` | Raw token (client credentials); optional `?scopes=...` |
| `/token/cc` | Call Facts.FactGroupsList with client credentials |
| `/token/bearer` | Get bearer token then call Facts.FactGroupsList |
| `/token/ropc` | Raw token via ROPC (username/password); optional `?scopes=...` |
| `/token/ropc-client` | Call Facts.FactGroupsList with ROPC auth |
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

## Parameters

Set Corti credentials in `.env` or `.env.local` (or environment):

| Variable | Description | Required |
|----------|-------------|----------|
| `CORTI_TENANT_NAME` | Your Corti tenant name | Yes |
| `CORTI_CLIENT_ID` | OAuth2 client ID (client credentials grant) | Yes |
| `CORTI_CLIENT_SECRET` | OAuth2 client secret (client credentials grant only) | Yes for `/token`, `/token/cc`, `/token/bearer` |
| `CORTI_ROPC_CLIENT_ID` | OAuth2 client ID for ROPC grant (resource owner password credentials) | For `/token/ropc`, `/token/ropc-client`; falls back to `CORTI_CLIENT_ID` if unset. ROPC is another OAuth grant type and may use a different client (e.g. public/native) than the client credentials grant (confidential). |
| `CORTI_USERNAME` | OAuth ROPC grant: resource owner username | For `/token/ropc`, `/token/ropc-client` |
| `CORTI_PASSWORD` | OAuth ROPC grant: resource owner password | For `/token/ropc`, `/token/ropc-client` |
| `CORTI_ENVIRONMENT` | `us` or `eu` | No (default: `us`) |
| `PORT` | Server port | No (default: 3000) |


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

To use the published package again: `npm install @corti/sdk@latest`.

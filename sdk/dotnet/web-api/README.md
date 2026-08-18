# Corti SDK Examples – .NET Web API

A minimal **ASP.NET Core** API that demonstrates the [Corti.Sdk](https://www.nuget.org/packages/Corti.Sdk) package: token flows, interactions, recordings, transcripts, facts, codes, templates, agents, **agentic** (v2), documents (classic and guided), **stream** and **transcribe** SDK WebSocket demos (two styles each), and **ambient** demos (async upload pipeline and real-time stream with facts mode).

## Why this example exists

This is a **server-side** reference API you can run locally. It shows how to:

- **Authenticate** — Client credentials, ROPC, refresh token, authorization code, and PKCE token endpoints (optional scopes where applicable).
- **Call Corti APIs** — Interactions (list, create, get, update, delete), recordings (list, upload sample, get, delete), transcripts (list, create from sample, get status, get, delete), facts (groups, list, create, update, batch, extract), codes (ICD-10-CM, CPT), languages, templates, agents (v1), agentic (v2), documents (classic interaction-scoped and guided).
- **Stream and transcribe** — Each demo is a **GET** that runs the SDK client in-process against sample audio (`trouble-breathing.mp3` under `sample/`), then returns a JSON payload of captured WebSocket messages. Variants: config sent after `ConnectAsync()` vs. `ConnectAsync(config)`.
- **Ambient** — `/ambient-async-end-to-end` and `/ambient-async-facts` exercise upload → transcript → document or facts extraction; `/ambient-rt-streams` exercises the real-time stream API in **facts** mode with chunked audio and `StreamEndMessage`.

Credentials are read from configuration or environment; the app uses the SDK to call Corti and returns JSON (or file/stream) to you. A **Postman** collection in this repo is set up for this API: import `sdk/postman/WebApi.postman_collection.json` and `sdk/postman/environments/DotNet.postman_environment.json`, choose the **"Web API – .NET"** environment (`http://localhost:5275`), start this app, then run requests from the **Web Api** collection. See `sdk/postman/README.md` for setup.

---

## Prerequisites

- [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)
- A **Corti account** and API clients from [Corti Console](https://console.corti.app).

---

## How to run

From this directory:

```bash
dotnet run
```

Or run from your IDE (Visual Studio / Rider / VS Code) using the **http** or **https** launch profile.

- **HTTP:** `http://localhost:5275`
- **HTTPS:** `https://localhost:7091` (and `http://localhost:5275`)

**Which port?** With **`dotnet run`** (or the IDE), the app listens on **5275** (HTTP) or **7091** (HTTPS). Use e.g. `http://localhost:5275/interactions`. Port **8080** is only used when you run the app **inside Docker** (see below).

---

## Run with Docker

From `sdk/dotnet/web-api`:

```bash
docker build -t corti-examples-api .
docker run -p 8080:8080 --env-file .env corti-examples-api
```

Or pass env vars explicitly: `docker run -p 8080:8080 -e CORTI__TENANTNAME=... -e CORTI__CLIENTID=... -e CORTI__CLIENTSECRET=... corti-examples-api`.

The API listens on **port 8080** inside the container. Use `http://localhost:8080` on the host. The image does not include `.env` or `appsettings.Development.json`; pass credentials via environment or `--env-file`.

**`connect ECONNREFUSED 127.0.0.1:8080`?** Use **port 5275** when running with `dotnet run`; use **8080** only when the container is running and you started it with `-p 8080:8080`. If the container exits, run `docker logs <container_id>` to see why.

---

## Endpoints (GET unless noted)

| Path | Description |
|------|-------------|
| `/token` | Raw token (client credentials); optional `?scopes=...` |
| `/token/cc` | Call Facts.FactGroupsList with client credentials |
| `/token/bearer` | Get bearer token then call Facts.FactGroupsList |
| `/token/ropc` | Raw token via ROPC (username/password); optional `?scopes=...` |
| `/token/ropc-client` | Call Facts.FactGroupsList with ROPC auth |
| `/token/ropc-refresh` | ROPC refresh token (refresh_token grant) |
| `/token/custom-refresh` | Custom refresh flow with ROPC credentials |
| `/token/auth-code-authorize` | Auth code: get authorization URL (query: redirectUri) |
| `/token/auth-code` | Auth code: exchange code for token (query: code, redirectUri) |
| `/token/pkce-authorize` | PKCE: get authorization URL (query: codeChallenge, redirectUri) |
| `/token/pkce` | PKCE: exchange code for token (query: code, codeVerifier, redirectUri) |
| `/client-variants` | Exercise CC, ROPC, auth code, PKCE clients; call Facts.FactGroupsList per variant (query: authCode, pkceCode, pkceVerifier) |
| `/interactions` | List, create, get, update, delete interactions (query: sort, direction, pageSize, index, encounterStatus, patient) |
| `/recordings` | List, upload sample, get (download), delete recording |
| `/transcripts` | List, create transcript from sample, get status, get, delete |
| `/facts` | Fact groups, list, create, update, batch update, extract |
| `/codes` | Code prediction (ICD-10-CM, CPT) |
| `/languages` | List supported languages (optional query: `endpoint=streams\|transcribe\|transcripts`) |
| `/templates` | List templates, list sections, get by key (query: org, lang, status) |
| `/agents` | Agents v1: list, create, get, card, registry experts, message send, get task/context, delete (query: limit, offset, ephemeral) |
| `/agentic` | Agentic v2: list/create/get/card, registry connectors, sendMessage, contexts list, usage, delete |
| `/documents` | Classic interaction-scoped documents (`Documents.Classic`): list, create, get, update, delete |
| `/documents/generate` | Guided documents: generate (ephemeral), list persisted, get first if any; returns `Sections` headings |
| `/documents/templates` | Guided templates: list, create, get, update, versions, delete |
| `/documents/sections` | Guided sections: list, create, get, update, delete |
| `/transcribe` | Dictation **transcribe** WebSocket: `ConnectAsync()`, then `TranscribeConfigMessage`, stream sample MP3 in chunks, flush; returns JSON with captured messages |
| `/transcribe-with-config` | Same as `/transcribe` but `ConnectAsync(TranscribeConfig)` so configuration is supplied at connect |
| `/stream` | Ambient **stream** WebSocket: optional `?interactionId=` (otherwise creates an interaction), `ConnectAsync()`, then `StreamConfigMessage` (transcription mode), chunks + flush; returns JSON |
| `/stream-with-config` | Same as `/stream` but `ConnectAsync(StreamConfig)` so configuration is supplied at connect |
| `/ambient-async-end-to-end` | Create interaction → upload sample recording → create transcript → create **SOAP** document from transcript; returns IDs, transcript, and document |
| `/ambient-async-facts` | Create interaction → upload → transcript (with diarization) → **Facts.Extract** from concatenated transcript text |
| `/ambient-rt-streams` | Create interaction → real-time **stream** client with **facts** mode + participants, stream sample audio in larger chunks, send `StreamEndMessage`, await ended; returns JSON message log |

---

## Parameters (configuration / environment)

Set Corti credentials in **appsettings.json**, **appsettings.Development.json**, **.env** / **.env.local**, or **environment variables**. The app loads `.env` and `.env.local` (if present) via DotNetEnv; `.env.local` overrides `.env`. For appsettings, use the `Corti` section; for environment variables, use the `Corti:` keys with double underscore (e.g. `CORTI__TENANTNAME`). Later sources override earlier ones.

### Client credentials (main)

Required for `/token`, `/token/cc`, `/token/bearer`, and most API endpoints (interactions, recordings, transcripts, facts, codes, templates, agents, agentic, documents, `/transcribe`, `/transcribe-with-config`, `/stream`, `/stream-with-config`, `/ambient-async-end-to-end`, `/ambient-async-facts`, `/ambient-rt-streams`):

| Key (appsettings) | Env variable | Description |
|-------------------|--------------|-------------|
| `Corti:TenantName` | `CORTI__TENANTNAME` | Your Corti tenant name |
| `Corti:ClientId` | `CORTI__CLIENTID` | OAuth2 client ID (client credentials) |
| `Corti:ClientSecret` | `CORTI__CLIENTSECRET` | OAuth2 client secret |

### ROPC (resource owner password credentials)

Required for `/token/ropc`, `/token/ropc-client`, `/token/ropc-refresh`, `/token/custom-refresh`, and ROPC usage in `/client-variants`:

| Key (appsettings) | Env variable | Description |
|-------------------|--------------|-------------|
| `Corti:Username` | `CORTI__USERNAME` | Resource owner username |
| `Corti:Password` | `CORTI__PASSWORD` | Resource owner password |
| `Corti:RopcClientId` | `CORTI__ROPCCLIENTID` | OAuth2 client ID for ROPC (optional; falls back to `Corti:ClientId`) |

### PKCE (authorization code + PKCE)

Required for PKCE token endpoints and PKCE usage in `/client-variants`. Tenant/environment fall back to main values if unset:

| Key (appsettings) | Env variable | Description |
|-------------------|--------------|-------------|
| `Corti:PkceClientId` | `CORTI__PKCECLIENTID` | OAuth2 client ID for PKCE flow |
| `Corti:PkceRedirectUri` | `CORTI__PKCEREDIRECTURI` | Redirect URI registered for the PKCE client |
| `Corti:PkceTenantName` | `CORTI__PKCETENANTNAME` | Tenant for PKCE (optional; falls back to `Corti:TenantName`) |
| `Corti:PkceEnvironment` | `CORTI__PKCEENVIRONMENT` | Environment for PKCE (optional; falls back to `Corti:Environment`) |

### Auth code (authorization code with client secret)

Required for auth-code token endpoints and auth-code usage in `/client-variants`. Tenant/environment fall back to main values if unset:

| Key (appsettings) | Env variable | Description |
|-------------------|--------------|-------------|
| `Corti:AuthCodeClientId` | `CORTI__AUTHCODECLIENTID` | OAuth2 client ID for auth code flow |
| `Corti:AuthCodeClientSecret` | `CORTI__AUTHCODECLIENTSECRET` | OAuth2 client secret for auth code flow |
| `Corti:AuthCodeRedirectUri` | `CORTI__AUTHCODEREDIRECTURI` | Redirect URI registered for the auth code client |
| `Corti:AuthCodeTenantName` | `CORTI__AUTHCODETENANTNAME` | Tenant for auth code (optional; falls back to `Corti:TenantName`) |
| `Corti:AuthCodeEnvironment` | `CORTI__AUTHCODEENVIRONMENT` | Environment for auth code (optional; falls back to `Corti:Environment`) |

### Global

| Key (appsettings) | Env variable | Description |
|-------------------|--------------|-------------|
| `Corti:Environment` | `CORTI__ENVIRONMENT` | `us` or `eu` (default: `eu` in code). Used when a flow-specific value is not set. |

If a required value is missing, endpoints that need it return **400** with a message indicating what to set.

---

## Optional: use a local Corti.Sdk build

By default the project uses the **Corti.Sdk** NuGet package. To use your local `corti-sdk-csh` build instead:

1. Copy `local.Corti.props.example` to `local.Corti.props` (the latter is gitignored).
2. In `local.Corti.props`, set `CortiProjectPath` to the path of `Corti.csproj` (e.g. `$(MSBuildThisFileDirectory)../../../corti-sdk-csh/src/Corti/Corti.csproj`).
3. Rebuild. The project will use the local SDK instead of NuGet.

This does not change runtime behaviour; it only switches the SDK reference at build time.

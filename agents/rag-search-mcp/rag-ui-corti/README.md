# rag-ui-corti

A React + Express app that connects to Corti, **provisions an orchestrator agent
wired to a document-search MCP on first run**, lets a clinician sign in, and
chats with the agent — minting scoped access tokens so the agent's MCP retrieval
only returns records that clinician is allowed to see.

It's the UI half of a shareable demo; the retrieval half is
[search-documents-mcp](../search-documents-mcp).

## High-level flow

```
Connect to Corti  →  Agent setup  →  Clinician sign-in  →  Patient panel  →  Chat
                      (detect by MCP URL;     (mock picker)   (+ Start chat)   (scoped to the
                       create if missing)                                      clinician's panel)
```

- **Agent setup** detects an existing orchestrator by its **MCP URL** (any
  agent name). If none exists, it shows a confirmation screen (the system prompt
  + MCP config the agent will get) with a field for your preferred agent name,
  then creates it in your tenant.
- Each chat message carries a short-lived signed **scope token** (the clinician's
  patient panel). Corti forwards it to the MCP, which verifies it and filters
  retrieval. No agent-list page and no ID/config side panels — just the chat box.

## Setup

```bash
npm install
cp .env.example .env     # then fill it in (see below)
```

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_CORTI_ENV` | yes | Corti environment (`us` or `eu`). |
| `VITE_CORTI_TENANT` | yes | Your Corti tenant name. |
| `VITE_CORTI_CLIENT_ID` | yes | OAuth client id for the Corti API. |
| `VITE_CORTI_CLIENT_SECRET` | yes | OAuth client secret for the Corti API. |
| `MCP_URL` | **yes** | Public HTTPS URL of the Search Documents MCP (e.g. `https://<tunnel>/mcp`). Must be reachable by Corti. **The server won't start without it.** |
| `MCP_NAME` | **yes** | Name the MCP server is registered under on the agent; the scope-token DataPart's `mcp_name` must match it. **The server won't start without it.** |
| `MCP_SCOPE_SECRET` | no | HMAC secret used to sign scope tokens. Must match the same variable in search-documents-mcp. Defaults to a shared dev secret (not safe for real use). |
| `SYSTEM_PROMPT` | no | Override the orchestrator's system prompt. A sensible default is baked in. |

`MCP_URL` and `MCP_NAME` are required with no fallback — the server fails fast
with a clear message if either is missing.

## Running

The MCP must be running and publicly reachable first, since `MCP_URL` is required
at startup:

```bash
# 1. Start the MCP and expose it (in ../search-documents-mcp)
npm install && npm run build && npm run reindex && npm run start:http
ngrok http 3000        # set this app's MCP_URL to the tunnel URL + /mcp

# 2. Start this app
npm start              # Express backend (:3003) + Vite frontend (:5175)
```

Then open http://localhost:5175 → **Connect → Agent setup** (name + create) **→
pick a clinician → Start chat**. You can also run the halves separately:

```bash
npm run server   # backend only, :3003 (node --watch)
npm run dev      # frontend only, :5175 (proxies /api to :3003)
```

> Each user runs against their own Corti tenant; the setup step provisions the
> orchestrator *in their tenant*. The MCP URL and secret are owner config (env),
> so a person you share with mainly supplies their own Corti credentials.

## Hardcoded / mock data

There's no real identity provider — [directory.js](directory.js) holds two mock
directories: `PATIENTS` (mock MRNs → display names) and `CLINICIANS` (each with a
`patients` panel of MRNs they may see). The MRNs match the patient records in
search-documents-mcp's docs so scoped retrieval lines up, and the signed-in
clinician's panel becomes the scopes in the minted token.

## How the token flow works

On each message the backend mints an HMAC-signed JWT-style token containing the
signed-in clinician's patient scopes (and display names) and attaches it as a
bearer-auth DataPart. Corti forwards it to the MCP, which verifies the signature
with the shared `MCP_SCOPE_SECRET`, records the scopes against the conversation's
`contextId`, and filters retrieval. Tokens are short-lived (5 minutes). The
signing logic lives in [token.mjs](token.mjs) and mirrors the MCP's verifier;
[mcp.js](mcp.js) mints the token using the audience the MCP expects
(`MCP_AUDIENCE = 'search-documents-mcp'`, defined in [config.js](config.js)).

## Layout

```
server.js              Express app wiring; mounts the routers under /api
config.js              env loading + fail-fast validation; MCP audience constant
corti.js               Corti SDK connection + shared error/guard helpers
session.js             in-process signed-in clinician + active MCP name
directory.js           mock PATIENTS / CLINICIANS (stubbed identity)
mcp.js                 scope-token minting from the clinician's panel
token.mjs              scope-token signing (HMAC); the MCP holds the verifier
routes/
  auth.js              connect to Corti
  clinicians.js        list clinicians / sign in
  agent.js             detect-by-URL / provision the orchestrator
  chat.js              start chat (warm-up + pre-bind) + message relay
  documents.js         upload a doc to the MCP, scope-authorized server-side
src/
  App.jsx              top-level flow/state
  AuthView.jsx         connect to Corti
  AgentSetupView.jsx   detect-by-URL / confirm + create the orchestrator
  ClinicianSignInView.jsx  mock clinician picker
  PatientPanelView.jsx the clinician's patients + Start chat / Upload
  UploadView.jsx       upload a doc, scoped to a patient or shared
  AgentChatView.jsx    the chat box (no side panels)
  api.js               frontend API client
  ui.jsx               shared UI primitives (Banner, ScreenHeader, …)
```

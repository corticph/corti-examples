# Corti SDK Sandbox

A local, documentation-style app of runnable Corti SDK and web-component
examples. Each applet page pairs an explanation and configuration reference with
the real source files and an authenticated live demo, so you can read how a
pattern works and try it against your own tenant in the same place.

> **Demo-grade.** These are teaching examples, not production code. They do not
> implement rate limiting, retry/backoff, or request cancellation (AbortSignal)
> on SDK calls. Use them as reference for SDK patterns, not as a blueprint for a
> production deployment.

## What’s here

The sidebar groups the applets into five areas:

- **Speech to Text** — endpoint language discovery, raw SDK microphone control,
  rich-text insertion, replacements and dictionary terms, voice commands, app
  control, dictation-box workflows, handheld microphone buttons, local audio
  archiving, file transcription, conversational diarization, and a complete
  recording-to-transcript REST flow.
- **Text Generation** — SOAP notes, discharge summaries, referral letters,
  procedure notes, template comparison, note comparison, and batch document
  processing.
- **Medical Coding** — note-to-code prediction, crosswalks, evidence-backed
  coding, validation, multi-encounter tracking, live encounter coding, and batch
  coding with a review queue.
- **Agentic** — multi-agent chart preparation, prior authorization, QA review,
  on-demand and second-pass agents, wake-command invocation, and a general
  conversational agent.
- **Extended workflows** — multi-source FactsR extraction, human approval
  checkpoints, role-scoped agents, and narrow-tool specialist networks.

Most live demos call a real Corti tenant. They may create interactions, upload
recordings, generate transcripts or documents, and invoke coding or agent APIs.
Use a non-production cluster and a disposable test tenant.

## Prerequisites

- Node.js 22 (see `.nvmrc`) and npm
- Corti client credentials and access to a Corti tenant and cluster, available
  from [Corti Console](https://console.corti.app)
- A supported browser; microphone and WebHID examples may require explicit
  browser permission and compatible hardware

## Quick start

```bash
git clone https://github.com/corticph/corti-examples.git
cd corti-examples/sdk/typescript/sandbox
cp .env.example .env   # then fill in your credentials, or enter them in the UI
npm install
npm run dev
```

The app runs at <http://localhost:8080>. Vite and the Express API share that
port, so there is no separate server to start.

To run the production build instead:

```bash
npm run build
npm start
```

The production server listens on port `3000`, or the value of `PORT`.

## Launcher

`bin/cli.mjs` starts the production server and opens a browser. Build first,
then run it from this folder:

```bash
npm run build
node bin/cli.mjs
```

It reads credentials from command-line options, `CORTI_*` environment
variables, or a `.env` file. If anything is missing, it prompts for it and can
save it to `./.env` for the next run.

```text
-p, --port <n>          Port to listen on (default 8080, or $PORT)
    --no-open           Do not open the browser automatically
    --cluster <name>    Corti cluster (otherwise $CORTI_ENVIRONMENT)
    --tenant <name>     Corti tenant (otherwise $CORTI_TENANT_NAME)
    --client-id <id>    OAuth client ID (otherwise $CORTI_CLIENT_ID)
    --client-secret <s> OAuth client secret (otherwise $CORTI_CLIENT_SECRET)
-h, --help              Show help
```

## Credentials

The sandbox supports two local credential flows.

### Server-configured credentials

Create `.env` in this folder (copy `.env.example`), or export the same variables
in your shell:

```env
CORTI_CLIENT_ID=your-client-id
CORTI_CLIENT_SECRET=your-client-secret
CORTI_ENVIRONMENT=dev-weu
CORTI_TENANT_NAME=your-tenant
```

In this mode the secret remains on the local server. The browser receives only
non-secret environment metadata and short-lived tokens scoped to direct
`transcribe` and/or `streams` WebSocket connections. REST requests go through
`/api/corti`, where the local proxy injects a server-held full-scope token and
the tenant header.

> **Never commit `.env`.** The repository `.gitignore` already excludes it.

### Credentials entered in the UI

You can also start the server without a `.env` and enter the cluster, tenant,
client ID, and client secret on the home page. The browser sends those values to
the local server for authentication; the server keeps them in memory, scoped to
that browser's session through an httpOnly cookie, so it can mint scoped
streaming tokens and proxy REST calls without one browser's credentials
affecting another session's requests. Only non-secret fields are saved to
browser local storage. The client secret and access tokens are not persisted
there.

This flow is intended for a local, single-user sandbox. Do not expose the
server publicly or treat it as a production credential service.

## Development

```bash
npm run dev        # Vite on :8080 with the Express routes mounted as middleware
npm test           # Vitest suite
npm run typecheck  # TypeScript
npm run lint       # Biome checks for client/ and server/
npm run build      # Production client and server bundles
```

CI runs `npm ci`, typecheck, test, lint, and build for this folder on every pull
request that touches it.

When you change `package.json` in a way that affects dependency resolution
(add/remove `overrides`, change version ranges, swap packages), clear Vite's
dependency optimization cache so the next dev startup rebuilds from the
current `node_modules` state:

```bash
rm -rf node_modules/.vite && npm run dev
# or: npm install && npx vite --force
```

Biome (`biome.json`) is the formatter and linter. `npm run format.fix` fixes
formatting and import order across `client/` and `server/`; for specific files,
run `npx biome check --write <files>`.

## Project structure

```text
client/
  applets/          One folder per applet, plus its details/configuration UI
    _shared/        Shared SDK, document, coding, transcript, editor, and device helpers
    registry.ts     Sidebar grouping, ordering, labels, and applet components
    sources.ts      Source files shown on applet documentation pages
    writeups.ts     Per-applet explanations and guided implementation notes
  components/docs/  Sidebar, source viewer, writeup renderer, and docs UI
  pages/Home.tsx    Home page and individual applet documentation pages
server/
  index.ts          Express app: /api/config, /api/auth/*, /api/corti/*
  routes/auth.ts    Server-held and UI-provided credential flows
  routes/corti-proxy.ts
                    Authenticated REST proxy to Corti
  lib/cortiToken.ts Credential storage and token minting
  lib/session.ts    corti_sid session cookie
  node-build.ts     Production server entry
bin/cli.mjs         Command-line launcher
```

Each applet demonstrates one concept and is registered in
`client/applets/registry.ts`. Shared integration seams belong in
`client/applets/_shared/`; applet-specific behavior stays in its own folder. See
[`client/applets/README.md`](client/applets/README.md) for the portability
conventions used by the applet layer.

## Authentication architecture

- `GET /api/config` exposes the cluster, tenant, and client ID, never the client
  secret.
- `POST /api/auth/token` validates credentials entered in the UI and stores them
  in server memory, scoped to that browser's session.
- `POST /api/auth/stream-token` returns a short-lived token scoped to the direct
  browser WebSocket connection the applet requests.
- `/api/corti/*` proxies REST calls to the selected Corti cluster and injects
  server-held authorization and tenant headers.

The SDK and web components derive the environment and tenant from the JWT
issuer, so the same examples work across clusters with the appropriate token.

## Public references

- [Corti documentation](https://docs.corti.ai)
- [API reference](https://docs.corti.ai/api-reference)
- [`@corti/sdk`](https://www.npmjs.com/package/@corti/sdk)
- [`@corti/dictation-web`](https://www.npmjs.com/package/@corti/dictation-web)
- [`@corti/ambient-web`](https://www.npmjs.com/package/@corti/ambient-web)

# Corti SDK Sandbox

`corti-sdk-sandbox` is the source-authoring environment for runnable Corti SDK
and web-component examples. It combines implementation notes, real source code,
configuration references, and live demos in one local application.

This repository is intentionally broader and more exploratory than
[`corti-examples`](https://github.com/corticph/corti-examples). Applets are
developed here with shared authentication, UI, and integration scaffolding;
selected applets may later be extracted into smaller, standalone customer
examples.

- `corti-sdk-sandbox` is the working repository for SDK and web-component
  patterns.
- `corti-examples` is the destination for polished, standalone examples.

The sandbox may start internal, but its code and documentation should remain
customer-safe: use public documentation and package references, and do not add
internal-only operational links or credentials.

> **Demo-grade.** These are teaching examples, not production code. They do not
> implement rate limiting, retry/backoff, or request cancellation (AbortSignal)
> on SDK calls. Use them as reference for SDK patterns, not as a blueprint for a
> production deployment.

## What’s here

The application is organized as a documentation site with a persistent sidebar.
Every applet page can include an explanation, reference/configuration details,
the real source files, and an authenticated live demo.

The sidebar groups the examples into five areas:

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

The **Getting started** page is a guided, runnable path through the core API workflow:

1. Initialize `@corti/sdk` and verify access with language discovery.
2. Create an interaction.
3. Upload recorded audio.
4. Create and poll an asynchronous transcript.
5. Predict medical codes and, when a tenant template is available, generate a
   clinical document.

Most live demos call a real Corti tenant. They may create interactions, upload
recordings, generate transcripts or documents, and invoke coding or agent APIs.
Use a non-production cluster and a disposable test tenant.

## Prerequisites

- Node.js 18 or newer
- npm
- Corti client credentials
- Access to a Corti tenant and cluster
- A supported browser; microphone and WebHID examples may require explicit
  browser permission and compatible hardware

## Quick start (run from a clone)

The sandbox is not yet published on npm. To run it, clone the repo and build
locally:

```bash
git clone https://github.com/corticph/corti-sdk-sandbox.git
cd corti-sdk-sandbox
npm install
npm run build
npm start
```

When started with `npm start`, the production server listens on port `3000` by
default, or the value of `PORT`.

For development with hot reload:

```bash
npm install
npm run dev
```

The development site is available at <http://localhost:8080>.

## Run the packaged sandbox (not yet available)

> The `npx` and global-install commands below are the intended distribution
> path once the package is published to npm or GitHub Packages. They do not
> work yet — see [Distribution roadmap](#distribution-roadmap) at the end of
> this document.

The packaged launcher starts the local UI and its server-side Corti proxy, then
opens a browser:

```bash
npx corti-sdk-sandbox

# Or install it globally
npm install -g corti-sdk-sandbox
corti-sdk-sandbox
```

It reads credentials from command-line options, `CORTI_*` environment
variables, or a `.env` file. If anything is missing, the launcher prompts for
it and can save it to `./.env` for the next run.

```text
-p, --port <n>          Port to listen on (default 8080, or $PORT)
    --no-open           Do not open the browser automatically
    --cluster <name>    Corti cluster (otherwise $CORTI_ENVIRONMENT)
    --tenant <name>     Corti tenant (otherwise $CORTI_TENANT_NAME)
    --client-id <id>    OAuth client ID (otherwise $CORTI_CLIENT_ID)
    --client-secret <s> OAuth client secret (otherwise $CORTI_CLIENT_SECRET)
-h, --help              Show help
```

### Credential options

The sandbox supports two local credential flows.

#### Server-configured credentials

Create `.env` in the project root, or export the same variables in your shell:

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

#### Credentials entered in the UI

You can also start the server without a configured `.env` and enter the cluster,
tenant, client ID, and client secret on the Overview page. The browser sends
those values to the local server for authentication; the server then retains
them in memory, scoped to that browser's session (via an httpOnly cookie), so
it can mint scoped streaming tokens and proxy REST calls without one browser's
pasted credentials affecting another session's requests. Only non-secret
fields are saved to browser local storage—the client secret and access tokens
are not persisted there.

This UI flow is intended for a local, single-user sandbox. Do not expose the
server publicly or treat it as a production credential service.

## Development

Start Vite with the Express API routes mounted as development middleware:

```bash
npm install
npm run dev
```

The development site is available at <http://localhost:8080>.

When you change `package.json` in a way that affects dependency resolution
(add/remove `overrides`, change version ranges, swap packages), clear Vite's
dependency optimization cache so the next dev startup rebuilds from the
current `node_modules` state:

```bash
rm -rf node_modules/.vite && npm run dev
# or: npm install && npx vite --force
```

Useful checks:

```bash
npm run test       # Vitest suite
npm run typecheck  # TypeScript
npm run lint       # Biome checks for client/ and server/
npm run build      # Production client and server bundles
```

Avoid running the repository-wide formatter for a focused change; format only
the files you touch to keep diffs reviewable.

## Repository structure

```text
client/
  applets/          Self-contained examples and their details/configuration UI
    _shared/        Shared SDK, document, coding, transcript, editor, and device helpers
    registry.ts     Sidebar grouping, ordering, labels, and applet components
    sources.ts      Source files displayed on applet documentation pages
    writeups.ts     Per-applet explanations and guided implementation notes
  components/docs/ Sidebar, source viewer, writeup renderer, and docs UI
  pages/Home.tsx    Overview and individual applet documentation pages
  pages/getting-started.tsx
                    Guided end-to-end API walkthrough ("Getting started")
server/
  routes/auth.ts    Server-held and UI-provided credential flows
  routes/corti-proxy.ts
                    Authenticated REST proxy to Corti
bin/cli.mjs         Packaged command-line launcher
```

Each applet demonstrates one concept and is registered in
`client/applets/registry.ts`. Shared integration seams belong in
`client/applets/_shared/`; applet-specific behavior should stay in its own
folder. See [`client/applets/README.md`](client/applets/README.md) for the
portability conventions used by the applet layer.

## Authentication architecture

- `GET /api/config` exposes server-configured cluster, tenant, and client ID—not
  the client secret.
- `POST /api/auth/token` validates credentials entered in the local UI and
  installs them as in-memory server credentials scoped to that browser's
  session.
- `POST /api/auth/stream-token` returns a short-lived token scoped to the direct
  browser WebSocket connection requested by the applet.
- `/api/corti/*` proxies REST calls to the selected Corti cluster and injects
  server-held authorization and tenant headers.

The SDK and web components can derive the environment and tenant from the JWT
issuer, allowing the same examples to work across clusters with the appropriate
token.

## Public references

- [Corti documentation](https://docs.corti.ai)
- [API reference](https://docs.corti.ai/api-reference)
- [`@corti/sdk`](https://www.npmjs.com/package/@corti/sdk)
- [`@corti/dictation-web`](https://www.npmjs.com/package/@corti/dictation-web)
- [`@corti/ambient-web`](https://www.npmjs.com/package/@corti/ambient-web)
- [`corti-examples`](https://github.com/corticph/corti-examples)

## Distribution roadmap

The sandbox is currently run by cloning this repo and building locally (see
[Quick start](#quick-start-run-from-a-clone)). The package is configured for
npm publishing — `package.json` includes `bin`, `files`, `engines`, and a
`prepublishOnly` build hook — but it has not been published yet.

Two distribution options are under consideration:

- **npm (public or private scoped).** The `@corti/*` SDK packages are already
  public on npm. Publishing `corti-sdk-sandbox` publicly would be consistent
  with that approach and would let anyone run `npx corti-sdk-sandbox` with no
  cloning or building. A private scoped package (e.g. `@corti/sandbox`)
  requires a paid npm Teams plan and each user must authenticate with an npm
  token.
- **GitHub Packages.** Publish as a scoped package (e.g.
  `@corticph/corti-sdk-sandbox`) to the GitHub npm registry. Access is
  scoped to the Corti GitHub org at no cost. Each user authenticates with a
  GitHub personal access token via `.npmrc`.

Before either path can proceed, the `license` field in `package.json`
(currently `"UNLICENSED"`) must be changed to a valid SPDX identifier.

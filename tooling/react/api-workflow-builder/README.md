# API Workflow Builder

A local web app for hand-testing the Corti API. A dev tool — faster than Postman for the specific shapes Corti expects, and better for chaining calls end-to-end.

Three pillars:

1. **Profiles** — switchable bundles of `{ region, tenant, clientId, clientSecret }` with cached OAuth tokens (~5 min TTL). Multiple profiles = multiple projects side-by-side.
2. **Endpoints catalog** — every Corti REST endpoint (plus the two WebSocket surfaces, Streams and Transcribe) with a schema-driven request form, pretty response viewer, and copy-paste-ready error diagnostics.
3. **Workflow builder** — a React Flow canvas where you chain endpoints, pipe outputs of one node into inputs of the next via `{{ref.field}}` templates, and run the whole graph in one click. Includes a pre-run modal for runtime inputs, live audio recording for stream nodes, per-run history, and Show-in-text renderings for documents/agents.

## Stack

- Vite + React 18 + TypeScript + Tailwind
- React Router v6, React Flow (`@xyflow/react`) for the workflow canvas, CodeMirror for the JSON editor
- Tiny Express dev server (`server/index.ts`) that mints OAuth tokens (avoids browser CORS to the auth endpoint)

## Prerequisites

- Node 20+ and npm
- Corti account and API credentials from [Corti Console](https://console.corti.app)

## Install & run

From the root of the `corti-examples` repo:

```bash
cd tooling/react/api-workflow-builder
npm install
npm run dev
```

`npm run dev` boots both servers concurrently:

- **Vite** on http://localhost:5173 — the app
- **Express** on http://localhost:5174 — `/api/auth/env`, `/api/auth/token`, `/api/health`

Open http://localhost:5173.

## How to test

The playground has no automated tests — it's a dev tool for hand-testing the API. To verify a working install:

1. `npm run lint` — Biome check, should exit clean.
2. `npm run build` — TypeScript + Vite build to `dist/`.
3. `npm run dev` — starts Vite + the Express token proxy. Open http://localhost:5173.
4. **Profiles → + New profile** → enter your Corti credentials.
5. **Endpoints → List interactions → Send** — successful 200 confirms auth + REST + proxy paths are wired.
6. **Workflows → the seeded starter workflow → Run workflow** — verifies template substitution + chained execution.

## First run

1. Open **Profiles** in the top nav.
2. Click **Import from .env** (if you set up `.env`, see below) OR click **+ New profile** and fill in the fields manually.
3. The TopBar shows the active profile. Switch with the dropdown when you're testing multiple projects.
4. Go to **Endpoints**, click any endpoint, fill in params/body, hit **Send**. Tokens mint lazily on first request and cache on the profile until expiry.
5. **Workflows** ships with a few starter workflows so you can see a full chain from the outset — click any of them to inspect. **+ New workflow** to build your own; drag endpoints from the left panel onto the canvas, wire them from right handle to left handle, edit each node in the right panel, hit **Run workflow**.

### .env (optional)

Set these in the repo root as `.env` if you want one-click profile seeding:

```dotenv
CORTI_CLIENT_ID=...
CORTI_CLIENT_SECRET=...
CORTI_ENVIRONMENT_ID=eu
CORTI_TENANT_NAME=base
```

`.env` is gitignored. The dev server reads it **only** to power **Import from .env** on the Profiles page. After that, secrets live per-profile in browser `localStorage` and only reach the dev server through `POST /api/auth/token` at token-mint time. Nothing is ever committed.

## Feature tour

### Endpoints catalog

Every REST endpoint is defined once in `src/endpoints/*.ts` and lights up automatically in the sidebar, the workflow add-node panel, and (where applicable) as a picker option for path/query params on other endpoints. Adding a new endpoint = adding one entry to the right file.

- **Required-first field ordering** at every nesting level.
- **☆ runtime toggle** on any field: mark it and the pre-run workflow modal asks for the value each run.
- **✦ auto-uuid toggle** on string/uuid fields: server-tombstoned identifiers (like `encounter.identifier`) auto-generate a fresh UUID at every run, no modal.
- **+ unique id button** on any string field: one-shot fill with a fresh UUID now.
- **Pickers** on path params (Interactions, Recordings, Transcripts, Documents, Agents, Templates, Sections) fetch from the corresponding list endpoint and populate a dropdown.
- **Multi-pickers** for array fields with curated option lists (e.g. Agent experts pull from the docs registry).

### Streams (WebSocket)

`Streams → Live stream` opens the /audio-bridge/v2/interactions/{id}/streams WSS. Pick an interaction, configure language + mode (facts / transcription), then record from mic or upload a file — the file path decodes to raw 16 kHz mono PCM so quality matches the source. BlackHole-style virtual devices work via the input picker.

### Transcribe (WebSocket)

`Transcribe → Live transcribe` opens the stateless /audio-bridge/v2/transcribe WSS. Same audio pipeline as Streams, minus the interaction binding. Interim + final transcripts, plus optional commands and replacements.

### Workflow builder

- **Nodes** — one per endpoint call. Drag from the left panel onto the canvas.
- **Edges** — drag from a node's right handle (output) to another node's left handle (input). Right-click an edge to remove it; Backspace works too.
- **Ref slugs** — every node gets a stable slug (`interactions_create_1`) so `{{interactions_create_1.interactionId}}` references its response.
- **Upstream picker** — the right-side panel on any node shows all reachable upstream outputs; click a field to copy the reference.
- **Built-in templates** — `{{$uuid}}`, `{{$timestamp}}`, `{{$epoch}}` resolve fresh on every run without needing the runtime modal.
- **Stream nodes** — when the executor hits a WSS node, it pauses and opens the recording modal in place; audio flows into the same interaction the upstream nodes wired.
- **Run history** — every run is captured (sent JSON + response JSON per node) and viewable from the History button. Last 20 runs per workflow, `localStorage`-backed.
- **Show in text** — for documents and agent responses, a per-node toggle renders the body as readable prose instead of JSON.

## Adding endpoints

Drop a new entry into the appropriate `src/endpoints/*.ts` (or create a new module + register it in `registry.ts`):

```ts
{
  id: "interactions.create",         // dotted, unique
  group: "Interactions",             // sidebar group heading
  method: "POST",
  path: "/interactions",
  label: "Create interaction",
  description: "...",
  pathParams:  [{ name: "id", in: "path", required: true, picker: interactionPicker }],
  queryParams: [{ name: "limit", in: "query", kind: "number", example: "10" }],
  body: { kind: "json", schema: [ /* BodyField[] */ ] },
  responseSchema: [ /* ResponseField[] — powers the upstream picker */ ],
}
```

The catalog page, the workflow builder, the run history, and the upstream picker all pick it up automatically.

## Workflow template syntax

In any string field, reference upstream output:

```
{{ref.path.to.field}}
```

The executor:

1. Topologically sorts nodes by edge dependencies.
2. For each node: substitutes templates, applies auto-uuid overrides, runs the endpoint-specific `preSendTransform`, then sends.
3. Stops on the first errored response and captures the partial run to history.

Special substitution rules for JSON bodies:
- `"{{ref.field}}"` — if the resolved value is an array/object, the surrounding quotes are unwrapped so it lands as a JSON value, not a stringified blob.
- `{{$uuid}}` / `{{$timestamp}}` / `{{$epoch}}` — resolve fresh per substitution.

## Adding a starter workflow

Users get seeded with the defaults in [src/workflows/defaults.ts](src/workflows/defaults.ts) on first launch (only when their `localStorage` is empty and no seed marker exists). To add a new default, export one of your working workflows via the **Export all** button on the workflows list page, then paste one workflow object into `DEFAULT_WORKFLOWS`. Keep `id` stable across releases so returning users don't accumulate duplicates.

## Path versioning

Endpoint paths in `src/endpoints/*.ts` are declared unversioned. The dev proxy prefixes `/v2/` for standard REST endpoints. Agentic-framework endpoints set `unversioned: true` and are mounted at the host root.

## File layout

```
server/
  index.ts                          Express: /api/health, /api/auth/env, /api/auth/token
src/
  main.tsx, App.tsx                 Bootstrap + routes
  context/ProfilesContext           Profiles state, active, ensureToken (mint + cache)
  profiles/                         Profile shape + localStorage
  endpoints/
    types.ts                        EndpointDef, ParamSpec, BodyField, ResponseField, MultiPickerConfig
    registry.ts                     Central group list
    interactions.ts, recordings.ts, transcripts.ts, documents.ts, facts.ts,
    codes.ts, agents.ts, streams.ts, transcribe.ts,
    guidedTemplates.ts, guidedSections.ts, languages.ts
  streams/                          Streams runner (mic + file + WSS) + audio primitives
  transcribe/                       Transcribe runner (stateless WSS)
  workflows/
    types.ts                        Workflow, WorkflowNode, WorkflowEdge, NodeResult, NodeErrorDetail
    context.tsx                     Workflows CRUD provider + first-launch seed
    defaults.ts                     Starter workflows shipped to new users
    storage.ts                      localStorage backing
    executor.ts                     Topo sort + template substitution + WSS pause/resume + preSendTransform
    refs.ts                         Ref slug generation, upstream discovery
    runtimeInputs.ts                Pre-run modal ask gathering + application
    errors.ts                       Error blob formatter + clipboard helper
    history.ts                      Per-workflow run history (localStorage, capped)
    EndpointNode.tsx                Canvas node (with Show-in-text, error copy, result body)
    NodeEditor.tsx                  Right-panel form (delegates to EndpointForm)
    PreRunModal.tsx                 Runtime input collection UI
    StreamRunModal.tsx              In-flow WSS recording modal
    RunHistoryModal.tsx             Past runs + expandable per-node JSON
  components/
    ui/                             Button, Card, Input, Modal, Pill
    TopBar.tsx                      Nav + active-profile switcher
    EndpointPicker.tsx              Reusable endpoint list (sidebar + workflow add panel)
    EndpointForm.tsx                Reusable schema-driven form (Params / Headers / Body)
    EndpointSidebar.tsx             Sidebar wrapper for the endpoints route
    BodyForm.tsx                    Nested JSON body form with runtime toggles
    JsonEditor.tsx                  CodeMirror JSON editor
    RequestRunner.tsx               Standalone endpoint runner
    ParamPicker.tsx                 Fetch-from-endpoint dropdown
    MultiPicker.tsx                 Multi-select variant (experts, etc.)
  lib/
    authApi.ts                      /api/auth/* clients
    requestExecutor.ts              Request builder + fetch wrapper
  pages/
    EndpointsLayout / EndpointsCatalog / EndpointPage
    ProfilesPage / ProfileEditPage
    WorkflowsListPage / WorkflowEditPage
```

## Known limitations

- **Files can't persist across sessions.** File uploads live in an in-memory ref for a single page session. If you reload, re-attach the file (or use the runtime input modal on each Run).
- **Sequential execution only.** No retries, branches, per-node loops, or parallelism yet.
- **No automated tests.** This is a personal dev tool; verify by running the app.
- **`/api/auth/env` returns credentials to the browser.** Intentional — it's how the Import-from-.env button works — but a reminder that the Express layer is a dev convenience, not a production API. Don't deploy it.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A browser-based testing tool for Corti's Speech-to-Text APIs. Exercises three endpoints:

- **WebSocket `/transcribe`** — connects directly with a token; supports voice commands and formatting.
- **WebSocket `/streams`** — requires an interaction ID; supports diarization, facts extraction, and a `mode` of `facts` or `transcription`.
- **REST `/transcripts`** — async transcript creation from uploaded recordings.

API reference docs are at https://docs.corti.ai/api-reference.

## Common commands

```bash
npm run dev          # Vite dev server on http://localhost:8080 (with Express middleware mounted)
npm run build        # build:client + build:server
npm run start        # run the production server bundle (dist/server/node-build.mjs)
npm run test         # vitest --run (single pass, no watch)
npm run typecheck    # tsc --noEmit
npm run format.fix   # prettier --write .
```

Run a single test: `npx vitest run client/hooks/useLiveTranscript.test.ts` (or pass `-t "<name>"` to match by test name).

**No CI.** There are no `.github/workflows` — nothing enforces lint/test/typecheck/prettier on push. `main` is not uniformly prettier-clean and `npm run format.fix` rewrites the **whole repo** (huge noisy diffs), so format only the files you touched (`npx prettier --check <files>`). Two pre-existing `tsc` errors in `client/hooks/useDictationSupportButtonMapping.ts` (`HIDDevice.serialNumber`) are unrelated to most work — don't chase them.

## Testing in-browser (Playwright + Chromium)

Most behavior (auth, the REST transcript flow, RTFx timing) can only be verified by driving the real UI — the app talks to a live Corti cluster (uploads and transcript calls go browser→cluster directly, not through the Express proxy).

- **Credentials & safety.** Credentials live on the **server**, read from `.env` (`CORTI_CLIENT_ID` / `_SECRET` / `_ENVIRONMENT` / `_TENANT_NAME`) by `server/lib/cortiToken.ts` — never bundled into the browser. The browser fetches non-secret cluster/tenant from `GET /api/config`, mints streaming-only tokens via `POST /api/auth/stream-token`, and routes all REST through the `/api/corti` proxy (which injects auth server-side). The app auto-authenticates once `/api/config` resolves; a "Re-authenticate" button shows once ready. Driving the flows performs **real writes** (creates interactions, uploads recordings, creates transcripts) against whatever cluster/tenant `.env` points at. **Before testing, confirm `.env` targets a non-prod cluster (e.g. `dev-weu`, `staging-eu`) and a disposable test tenant — never run test flows against production credentials.** Never print the client secret in logs/output.
- **Playwright isn't a dependency** — install it in an isolated temp dir so it doesn't race the running dev server's `node_modules` (a repo-local `npm i` collides with Vite and fails `ENOTEMPTY`):
  ```bash
  mkdir -p /tmp/pw && (cd /tmp/pw && npm init -y && npm i playwright)
  npx playwright install chromium      # browser cache is global (~/Library/Caches/ms-playwright)
  # then require('/tmp/pw/node_modules/playwright') from a CommonJS (.cjs) script
  ```
- **Selectors.** Endpoint buttons render multiline text (e.g. `📜\nTranscripts\nREST`) — match with `button:has-text("Transcripts")`, not `getByRole({ name })`.
- **Transcripts happy path:** select Transcripts → **Create Interaction** → `setInputFiles` on `input[type=file]` (only present after the interaction exists; pass an array of the same path to stage N concurrent jobs) → **"Create transcripts for N uploaded recording(s)"** → poll for the `Done · N×` pill on each job row. The pill is rendered straight from `job.timing.rtfx`, so a non-bare pill is sufficient proof timing finalized.

## Architecture

**Hybrid Vite + Express app.** `vite.config.ts` registers an `expressPlugin` that mounts `createServer()` from `server/index.ts` as middleware on the Vite dev server, so `/api/*` calls hit Express directly during development. In production, `server/node-build.ts` serves the built SPA from `dist/spa` and the same Express routes from `dist/server`.

**Why the Express layer exists.** The browser cannot talk to Keycloak directly because of CORS, so `server/routes/auth.ts` proxies `POST /api/auth/token` to `https://auth.<cluster>.corti.app/realms/<tenant>/protocol/openid-connect/token`. `server/routes/interactions.ts` similarly proxies interaction create/get to `https://api.<cluster>.corti.ai/v2/interactions`. **Everything else (WebSocket connections, recording uploads, transcript REST calls) is made directly from the browser** — see `client/lib/proxy-urls.ts`, which intentionally lists only `auth`.

**Frontend layout.**

- `client/pages/Index.tsx` is the single-page UI orchestrator (~44KB) — most user state lives here and is passed into hooks.
- `client/components/ConnectionPanel.tsx` (~127KB) is the dominant UI component; it renders config for all three endpoints. Treat it as a controlled monolith — prefer extracting hooks over splitting the component when adding behavior.
- Heavy logic lives in `client/hooks/`, not in components: `useWebSocket` (~34KB) handles streaming/config/dispatch for both WS endpoints; `useCortiAuth` owns auth and env-config persistence; `useAudio` wraps MediaRecorder; `useRestTranscripts` drives the REST flow; `usePdcButtonMapping` and `useDictationSupportButtonMapping` map hardware buttons (Philips PDC and WebHID).
- Types are centralized in `client/types/` — `websocket.ts` is the source of truth for WS message shapes and config interfaces; `rest-api.ts` for REST.

**Path aliases** (defined in both `tsconfig.json` and `vite.config.ts`): `@/*` and `client/*` → `./client`, `server/*` → `./server`, `@shared/*` and `shared/*` → `./shared`. Use the `client/` form in new code; both work.

## Project-specific rules

**Corti API field casing.** REST request bodies use **camelCase**, matching the Corti API spec (`recordingId`, `primaryLanguage`, `modelName`, `isDictation`, `async`, `isMultichannel`, `diarize`, `participants`). The internal config types and the `Api*` wire interfaces (e.g. `ApiTranscriptCreateRequest`) are both camelCase; `useRestConfig.toApiRequest` builds the wire body and `Index.tsx` injects each job's `recordingId`. The API response uses `id`, not `transcriptId`.

**WebSocket handshake.** Both WS endpoints require a `CONFIG_ACCEPTED` server message before audio frames may be sent. Sending audio before config acceptance will fail silently or with an error.

**`/transcribe` vs `/streams` differences worth keeping straight:**

- `/transcribe`: no interaction ID, flat config (`primaryLanguage`, `model`, `formatting`, `commands`), returns single transcript objects, supports voice commands.
- `/streams`: needs an interaction ID created first, nested config (`transcription` + `mode`), returns transcript arrays, supports facts and diarization.

**REST workflow order:** authenticate → create interaction → upload recording → create transcript → poll/view. None of those steps work without the interaction ID. `useRestTranscripts.createTranscript` auto-starts the GET poll loop when the create response comes back with `status: "processing"`, so the manual "Get Transcript" button is only needed for arbitrary IDs or to override the poll timeout.

**`/transcripts` `async` parameter.** When `async: true` (the tester's default), the API skips the synchronous-processing window and returns `202 Accepted` + a `Location` header immediately with a `processing` body; the auto-poll above then drives it to completion.

**REST timing / RTFx** (`useRestTranscripts` + `TranscriptJobsList`). RTFx is measured **per recording**: `rtfx = audioDurationMs / wallClock(POST→paint)`, with an individual start (its own POST) and stop (its own paint) per job — concurrent recordings are each timed independently. Audio duration is the **real uploaded-file duration** measured client-side (`getAudioFileDurationMs`, an `<audio>`-metadata read), falling back to the last transcript segment's `end` only when the file duration is unavailable (e.g. the fetch-by-id debug job). The finalize step (`markJobRendered`) is **paint-gated and must require `status === "completed"`**: `pollForJob` patches partial `details` on every interim "processing" poll, and `pendingTimingRef` is only staged at completion — so a `JobRow` paint signal that fires on an interim render races ahead of staging and permanently drops `job.timing` (symptom: row stuck at `Done` with no RTFx pill).

**UI conventions.** Tailwind utilities only — no inline styles, no CSS modules. Combine classes with `cn()` from `client/lib/utils.ts`. UI primitives in `client/components/ui/` follow shadcn/ui patterns. Put complex logic in hooks, not inside JSX. **UI text uses sentence case** (only the first word capitalized: "Flush all buffers", not "Flush All Buffers") — proper nouns and acronyms (Corti, RTFx, WebSocket, REST, MIME, PDC) keep their casing. Existing Title Case is pre-existing debt; fix it in files you're already touching, but don't do an unprompted whole-app sweep.

**TypeScript posture.** `strict` is **off** in `tsconfig.json` (including `strictNullChecks` and `noImplicitAny`). Existing code reflects this — don't tighten it without a reason. Still, prefer explicit types over `any` and put new types in `client/types/`.

## Auxiliary tooling

`scripts/malicious-npm-package-scanning/` is a standalone Python utility (uv + Python 3.10+) for scanning Corti repos' lockfiles against a malicious-package list. Unrelated to the app runtime.

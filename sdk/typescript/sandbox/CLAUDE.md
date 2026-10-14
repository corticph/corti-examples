# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this folder.

## Overview

A documentation-style sandbox of runnable Corti SDK and web-component examples ("applets"). It lives in `corti-examples` at `sdk/typescript/sandbox/` and is a self-contained project with its own `package.json`, lockfile, and `.npmrc`. Run every command from this folder.

Each applet page combines a writeup, a details/configuration card, the applet's real source files (imported via Vite `?raw`), and a live demo against a real Corti tenant. API reference: <https://docs.corti.ai/api-reference>.

## Commands

```bash
npm run dev          # Vite on http://localhost:8080, with the Express app mounted as middleware
npm run build        # build:client (dist/spa) + build:server (dist/server)
npm start            # production server: dist/server/node-build.mjs on :3000 or $PORT
npm test             # vitest --run
npm run typecheck    # tsc (noEmit is set in tsconfig.json)
npm run lint         # biome check client/ server/
node bin/cli.mjs     # launcher: needs a build first; prompts for missing creds, can write ./.env
```

Run a single test: `npx vitest run client/applets/_shared/offsetMap.test.ts` (or `-t "<name>"`). Tests sit next to the code as `*.test.ts`; DOM tests opt in with a `@vitest-environment jsdom` header.

**CI.** `.github/workflows/sdk-examples-ci.yml` at the repo root runs `npm ci`, typecheck, test, lint, and build for this folder on every PR that touches it, using Node from `.nvmrc` (22). Lint must be clean.

**Formatting.** Biome (`biome.json`, 100-column lines) is the formatter and linter. Use `npx biome check --write <files>` on files you touch. Do not run `npm run format.fix`: it runs Prettier at 80 columns over the whole folder, rewrites everything, and breaks `npm run lint`.

**Dependencies.** `@corti/sdk` is pinned to an exact version in both `devDependencies` and `overrides`, and bumped with the rest of the repo. Keep `.npmrc` (`legacy-peer-deps=true`): `npm ci` needs it to resolve the committed lockfile.

## Architecture

**Hybrid Vite + Express.** `vite.config.ts` registers `expressPlugin`, which mounts `createServer()` from `server/index.ts` on the Vite dev server, so `/api/*` hits Express in development. In production, `server/node-build.ts` serves `dist/spa` and the same Express app. `dotenv` reads `.env` from the working directory with `override: true`.

**Server (`server/`).**

- `index.ts`: mounts `/api/corti` (proxy) before the body parsers, then `GET /api/config`, `GET /api/ping`, and `/api/auth`.
- `routes/auth.ts`: `POST /api/auth/token` validates UI-entered credentials and stores them for the session; `POST /api/auth/stream-token` mints a short-lived token scoped to `transcribe` and/or `streams` for direct browser WebSockets.
- `routes/corti-proxy.ts`: forwards `/api/corti/*` to `https://api.<cluster>.corti.app`, injecting the full-scope token, `Tenant-Name`, and `x-corti-analytics` (when missing). One proxy instance per cluster. The token is resolved before proxying because `proxyReq` fires synchronously. It must stay mounted before `express.json()` so uploads stream through.
- `lib/cortiToken.ts`: credentials come from `CORTI_*` env vars (shared) or from the UI (scoped to the session). The full-scope token never leaves the server.
- `lib/session.ts`: `corti_sid` httpOnly cookie that scopes UI-entered credentials to one browser.

**Client (`client/`).**

- `App.tsx` routes: `/` (Home), `/getting-started`, `/:workflow/:applet` (AppletPage), and `*` (NotFound).
- `pages/Home.tsx` renders both the home page (stats, credential form) and `AppletPage`, which assembles writeup, details, sources, and live demo for one applet.
- `applets/registry.ts` is the manifest: each `AppletDefinition` has `id`, `title`, `description`, `workflow` (sidebar area), `icon`, `Component`, and optional `Details`/`ExtraSection`/`wide`. **Adding an applet:** create `client/applets/<id>/`, add one registry entry, then optionally add sources in `sources.ts` and a writeup in `writeups.ts`.
- `applets/sources.ts` imports source files with `?raw` and shows them verbatim. Those files are teaching code read by customers, so keep them readable and self-explanatory.
- `applets/writeups.ts` holds per-applet prose and code snippets (snippets are strings, not compiled).
- Auth: `context/AuthContext.tsx` holds one `useCortiAuth` instance (non-secret config persisted in localStorage as `corti-sandbox-auth`) and feeds `AppletAuthProvider` (`applets/_shared/authContext.tsx`). Applets read it through `applets/_shared/useCortiAccessToken.ts`, which returns `authConfig` (token + refresh) and `sdkEnvironment` (REST and agents through `/api/corti`, WebSockets direct to the cluster).
- `applets/_shared/` holds the shared seams: editor adapter, command dispatch, offset map, text insertion, diarized transcript, audio archive, device buttons, `configStore` (namespaced localStorage), `sessionState`, and the `@lit/react` wrappers `cortiDictationReact.tsx` / `cortiAmbientReact.tsx`.

**Path aliases** (in `tsconfig.json` and `vite.config.ts`): `@/*` and `client/*` → `./client`, `server/*` → `./server`, `@shared/*` and `shared/*` → `./shared`.

## Rules

**Runtime contract.** Users rely on these staying the same: ports 8080 (dev and launcher) and 3000 (`npm start`), the `CORTI_*` env var names, the `/api/*` routes, the UI routes, the `corti_sid` cookie, and every localStorage key (saved settings carry over between versions).

**Analytics tagging.** Every `new CortiClient({...})` passes `analytics: EXAMPLES_ANALYTICS` from `client/applets/_shared/examplesAnalytics.ts`, inline at the call site. The web-component wrappers set `el.analytics` the same way. Code snippets inside strings (`writeups.ts`, `getting-started.tsx`) stay untagged.

**Home page stats** count `applets/_shared/**/*.tsx` and `components/ui/**/*.tsx` files via `import.meta.glob`, so adding or removing `.tsx` files there changes numbers users see.

**Corti API field casing.** REST request bodies use camelCase, matching the Corti API spec (`recordingId`, `primaryLanguage`, `modelName`, `isDictation`, `async`, `isMultichannel`, `diarize`, `participants`). Transcript responses use `id`, not `transcriptId`.

**WebSocket endpoints.** Both require a `CONFIG_ACCEPTED` server message before audio frames may be sent. `/transcribe` takes no interaction ID and a flat config (`primaryLanguage`, `model`, `formatting`, `commands`), returns single transcript objects, and supports voice commands. `/streams` needs an interaction ID, takes a nested config (`transcription` + `mode`), returns transcript arrays, and supports facts and diarization.

**REST workflow order:** authenticate → create interaction → upload recording → create transcript → poll. Every step after the first needs the interaction ID. With `async: true`, transcript creation returns `202 Accepted` with a `processing` body and must be polled.

**UI conventions.** Tailwind utilities only, no inline styles or CSS modules. Combine classes with `cn()` from `client/lib/utils.ts`. Primitives in `client/components/ui/` follow shadcn/ui. UI text uses sentence case ("Flush all buffers"); proper nouns and acronyms keep their casing. Fix existing Title Case only in files you are already touching.

**TypeScript posture.** `strict` is off in `tsconfig.json` (including `strictNullChecks` and `noImplicitAny`). Don't tighten it without a reason; still prefer explicit types over `any`.

## Testing in the browser

Most behavior can only be verified by driving the real UI against a live Corti cluster.

- **Credentials and safety.** Credentials live on the server (`.env` or the home-page form). Live demos perform real writes (interactions, recordings, transcripts, documents, agents). Before testing, confirm the credentials target a non-prod cluster (e.g. `dev-weu`, `staging-eu`) and a disposable test tenant. Never print the client secret.
- **Playwright isn't a dependency.** Install it in an isolated temp dir so it doesn't race the dev server's `node_modules` (a local `npm i` collides with Vite and fails with `ENOTEMPTY`):

  ```bash
  mkdir -p /tmp/pw && (cd /tmp/pw && npm init -y && npm i playwright)
  npx playwright install chromium
  # then require('/tmp/pw/node_modules/playwright') from a CommonJS (.cjs) script
  ```

# Corti Dictation Web Component — Demos

Interactive demos for the [`@corti/dictation-web`](https://www.npmjs.com/package/@corti/dictation-web)
Web Component. Each demo is a standalone HTML file served by a small Express server that mints
short-lived transcribe tokens using your client credentials — no token copy-pasting required.

## Demos

| File | Description |
|---|---|
| [basic-demo.html](basic-demo.html) | Minimal integration: component renders its own UI, transcripts appended to a textarea |
| [custom-ui-demo.html](custom-ui-demo.html) | Component UI hidden; custom buttons, mic selector, language picker, and audio-level visualizer |
| [styling-demo.html](styling-demo.html) | CSS custom properties for theming; light/dark mode toggle |
| [refresh-demo.html](refresh-demo.html) | `authConfig` with automatic token refresh via `/api/token` callback |


## Quick start

```sh
cp .env.example .env   # fill in your credentials
npm install
npm run dev            # starts server at http://localhost:3000
```

Open http://localhost:3000 — the index page links to all demos.

## Environment variables

| Variable | Description |
|---|---|
| `CORTI_TENANT_NAME` | Your Corti tenant name |
| `CORTI_CLIENT_ID` | OAuth client ID |
| `CORTI_CLIENT_SECRET` | OAuth client secret |
| `CORTI_ENVIRONMENT` | `eu` (default) or `us` |
| `PORT` | Port to listen on (default `3000`) |

## How it works

The `@corti/dictation-web` package is loaded directly from [esm.sh](https://esm.sh) — no local
build step required.

The server exposes one endpoint:

- **`POST /api/token`** — exchanges your client credentials for a short-lived transcribe-scoped
  access token and returns `{ accessToken }`. Credentials never leave the server.

Each demo fetches a token on page load and passes it to the `<corti-dictation>` element.

# Corti Ambient — Basic Example

Minimal example showing real-time ambient streaming with the Corti SDK (`client.stream.connect`).

## What this example does

1. **Authenticates** with client credentials on the server only
2. **Creates an interaction** and mints a `streams`-scoped token for the browser
3. **Connects** to the ambient WebSocket for that interaction
4. **Streams microphone audio** and prints **transcript** segments and **facts** as they arrive
5. **Ends** the session with `sendEnd` when you click End session

## Quick start

```bash
npm install
cp .env.example .env
# Edit .env with CORTI_TENANT_NAME, CORTI_CLIENT_ID, CORTI_CLIENT_SECRET
npm run dev
```

Open `http://localhost:3000`.

## Core files

| File | Role |
| --- | --- |
| [server.ts](server.ts) | `POST /api/start-session` — interaction + streams token |
| [client.ts](client.ts) | `startSession()` — stream connect, mic capture, callbacks |
| [index.html](index.html) | Start / end UI and transcript + facts panels |

For the pre-built web component (UI, virtual mode, settings), see [../web-component/](../web-component/).

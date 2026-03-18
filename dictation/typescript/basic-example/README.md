# Corti Dictation — Basic Example

Minimal example showing how to integrate real-time dictation using the Corti SDK.

## What This Example Does

1. **Authenticates** with Corti using client credentials (server-side only)
2. **Mints a scoped token** (`transcribe` scope) and sends it to the browser — client credentials never leave the server
3. **Opens a transcription WebSocket** via `client.transcribe.connect()`
4. **Streams microphone audio** to Corti in 250 ms chunks
5. **Displays live transcripts** — interim results update in real time, final results are committed
6. **Handles voice commands** — "next section", "new paragraph", "delete last"

## What This Example Doesn't Cover

- Custom vocabulary / formatting rules
- Multiple audio channels / speaker separation
- Production error handling and reconnection strategies
- State management

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure credentials:

```bash
cp .env.example .env
# Edit .env with your CORTI_TENANT_NAME, CORTI_CLIENT_ID, CORTI_CLIENT_SECRET
```

3. Start the server:

```bash
npm run dev
```

Opens on `http://localhost:3000`.

## Core Files

### Backend

- **[server.ts](server.ts)** — Express server:
  - Loads credentials from `.env`
  - `POST /api/start-session` — mints a `transcribe`-scoped token and returns `{ tenantName, environment, accessToken }`
  - Serves static files (`index.html`, `dist/client.js`)

### Frontend

- **[client.ts](client.ts)** — SDK integration (bundled by esbuild):
  - `startSession(options)` — connects the transcribe WebSocket on first call and reuses it on subsequent calls; streams microphone audio
  - Fires `onReady`, `onTranscript`, and `onCommand` callbacks
  - Returns a `{ stop() }` handle that flushes remaining audio and resolves when the server confirms

- **[index.html](index.html)** — UI:
  - Start / Stop / Clear buttons
  - Live transcript display (interim text in grey, final text committed on each final result)
  - Voice command badges inserted inline

### Configuration

- **`.env`** — credentials (copy from `.env.example`):
  - `CORTI_TENANT_NAME`, `CORTI_CLIENT_ID`, `CORTI_CLIENT_SECRET`
  - `CORTI_ENVIRONMENT` — `eu` or `us` (default: `eu`)
  - `PORT` — server port (default: `3000`)

## Core API Flow

```typescript
// Server: mint a scoped token
const token = await new CortiAuth({ environment, tenantName }).getToken({
  clientId, clientSecret, scopes: ["transcribe"],
});

// Browser: connect once, send config, then start audio on CONFIG_ACCEPTED
const socket = await client.transcribe.connect();
await socket.waitForOpen();
socket.sendConfiguration({ type: "config", configuration: { primaryLanguage: "en-US", ... } });

socket.on("message", (msg) => {
  if (msg.type === "CONFIG_ACCEPTED") {
    const recorder = new MediaRecorder(micStream);
    recorder.ondataavailable = async (e) => socket.sendAudio(await e.data.arrayBuffer());
    recorder.start(250);
  }
  if (msg.type === "transcript") console.log(msg.data.isFinal, msg.data.text);
  if (msg.type === "command")    console.log(msg.data.id);
  if (msg.type === "flushed")    console.log("all audio processed, socket still open");
});

// Stop: flush remaining audio; socket stays open for reuse
socket.sendFlush({ type: "flush" });
```
# Corti WebSocket Proxy — Basic Example

A minimal WebSocket proxy server that sits between the browser and the Corti API.
The browser never touches Corti directly — all traffic is routed through this server,
which authenticates with Corti using server-side client credentials.

## Why a proxy?

Calling the Corti API from the browser would expose your client secret. The proxy pattern
keeps credentials on the server and lets you control access, add rate limiting, or inject
your own auth layer on top.

## How it works

```
Browser (corti-dictation web component)
    │  ws://localhost:3001/proxy?proxy-auth-token=<token>
    ▼
Proxy server (this example)
    │  Corti SDK — client credentials auth
    ▼
Corti transcription API (wss://...)
```

1. The browser connects to the proxy WebSocket with a `proxy-auth-token` query parameter.
2. The proxy validates the token (presence check — replace with your own auth logic).
3. The proxy opens a Corti transcription WebSocket via the SDK using server-side credentials.
4. All messages are forwarded verbatim in both directions.

## Quick start

```sh
cp .env.example .env   # fill in your credentials
npm install
npm start              # starts proxy at http://localhost:3001
```

Open http://localhost:3001 to see the test page using the `<corti-dictation>` web component.

## Environment variables

| Variable | Description |
|---|---|
| `ENVIRONMENT_ID` | Corti environment — `eu` or `us` |
| `TENANT_NAME` | Your Corti tenant name |
| `CLIENT_ID` | OAuth client ID |
| `CLIENT_SECRET` | OAuth client secret |
| `PORT` | Port to listen on (default `3001`) |

## Core files

- **[simple-proxy-server.js](simple-proxy-server.js)** — Express + WebSocket server; authenticates
  incoming connections and proxies traffic to Corti
- **[corti-setup.js](corti-setup.js)** — `CortiClient` initialisation and socket factory; also
  includes a commented alternative using `CortiAuth` + native WebSocket for lighter setups
- **[public/test.html](public/test.html)** — browser test page using `@corti/dictation-web` via esm.sh

## Replacing the proxy auth

The example validates connections by checking for a non-empty `proxy-auth-token` query parameter.
In production, replace this check with your own auth (e.g. verify a JWT or session token):

```js
// simple-proxy-server.js
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const authToken = url.searchParams.get('proxy-auth-token');

  if (!isValid(authToken)) {   // ← your auth logic here
    socket.destroy();
    return;
  }
  // ...
});
```

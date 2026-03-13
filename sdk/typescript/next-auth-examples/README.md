# Corti SDK — Next auth examples

A minimal Next.js application demonstrating **four Corti auth flows** with the [`@corti/sdk`](https://www.npmjs.com/package/@corti/sdk) in a frontend context.

## What this example presents

- **Client Credentials** — Exchange client ID and secret for an access token (machine-to-machine).
- **ROPC (Resource Owner Password Credentials)** — Exchange username and password for a token (embedded assistant / “customers” in Console).
- **Authorization Code** — Redirect user to Corti login, then exchange the returned `code` for a token (with client secret).
- **PKCE (Authorization Code + PKCE)** — Same redirect flow without a client secret; uses code verifier/challenge.

For each flow you enter credentials in the form (tenant, environment, client ID, etc.). After a successful token exchange, the app shows a **success view** with a masked access token, optional refresh token, and a short list of **interactions** fetched from the Corti API to prove the token works.

Token requests are sent to **Next.js API routes** (`/api/auth/token/...`), which call the Corti auth APIs server-side so the client secret (when used) never leaves your server.

---

## ⚠️ Security notice

**We do not recommend storing or handling access tokens directly in a browser application.**

Keeping credentials or short-lived tokens in frontend code exposes them to XSS attacks, browser storage leaks, and accidental logging. The recommended production pattern is a **server-side proxy**:

1. Your backend authenticates with Corti and holds the token.
2. The browser calls your own API endpoints, which forward requests to Corti with the token attached server-side.
3. The browser never sees the raw token.

**This example exists purely for demonstration purposes** — to show how the SDK can be initialised and called from a browser environment (e.g. when tokens are obtained via an auth flow you already control and need to pass to the SDK). Do not ship a production app that stores Corti tokens in `localStorage`, cookies without `HttpOnly`, or any other client-accessible location.

---

## Getting started

### Prerequisites

- **Node.js 18+**
- A **Corti account** and API clients created in [Corti Console](https://console.corti.app). Each auth flow requires the corresponding client type (e.g. “Use with Embedded Assistant” and ROPC or Auth Code/PKCE). The in-app copy links to Console where relevant.


### Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Choose an auth flow, fill in your Corti credentials (client ID, tenant, environment, etc.), and complete the flow to see the token and interactions list.

---

## Project structure

```
app/
  layout.tsx          # Root layout
  page.tsx            # Home: flow selection, forms, success view
  globals.css         # Styles
  api/auth/token/     # API routes: POST for client credentials, ROPC, auth code, PKCE
  components/         # Intro, credential forms, success view, copyable field, etc.
  lib/                # Types, constants, token request helper, interactions hook
```

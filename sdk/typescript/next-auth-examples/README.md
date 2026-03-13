# Corti SDK — Next auth examples

A minimal Next.js application demonstrating auth flows with the [`@corti/sdk`](https://www.npmjs.com/package/@corti/sdk) in a frontend context.

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

- Node.js 18+
- A Corti account with API credentials

### Environment variables

Copy `.env.local.example` to `.env.local` and fill in your values:

```bash
cp .env.local.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CORTI_TENANT` | Your Corti tenant name |
| `NEXT_PUBLIC_CORTI_ENVIRONMENT` | Environment region, e.g. `eu` |

> Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser bundle. Never put secrets (client secrets, passwords) in `NEXT_PUBLIC_` variables.

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project structure

```
app/
  layout.tsx       # Root layout
  page.tsx         # Home page
```

More pages and SDK usage examples will be added here.

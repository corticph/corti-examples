# Ambient Scribe Quickstart

The fastest path from a cloned repo to a working ambient scribe result on your machine.

## What this does

One command runs the full ambient scribe pipeline against the Corti API and prints a generated
clinical note:

**auth → create interaction → upload sample audio → transcribe → extract facts → generate a
structured note**

The script
does the wiring for you so you can see the whole pipeline work end to end before you write any
integration code of your own.

## Who this is for

Developers who just got Corti credentials and want to see the ambient scribe workflow actually
run — once — before diving into `@corti/sdk` API design decisions.
You can test out a fully functional 
ambient scribe in the [AI Studio](https://console.corti.app).
This is **not** a reference for
production patterns (auth flow choice, streaming, error handling, UI). For that, see
[What's next](#whats-next) below.

## Prerequisites

- Node.js 18+
- A Corti account with API credentials (tenant name, client ID, client secret) from
  [Corti Console](https://console.corti.app)

## Setup

```bash
cp .env.example .env
```

Edit `.env` and fill in the three required values from Corti Console (**Settings → Apps**):

```bash
CORTI_TENANT_NAME=your-tenant
CORTI_CLIENT_ID=your-client-id
CORTI_CLIENT_SECRET=your-client-secret
```

`CORTI_ENVIRONMENT` is optional and defaults to `eu` (set it to `us` if your tenant is on the US
region). If any required variable is missing, the script tells you exactly which one before
making any API call.

```bash
npm install
```

## Run

```bash
npm run demo
```

## What happens during the run

The script logs each step as it happens:

1. **Auth** — builds a `CortiClient` from your client ID/secret. The SDK fetches an access token
   on first use and refreshes it automatically; you never see or handle it directly.
2. **Create interaction** — calls `interactions.create()` and gets back an `interactionId`. Every
   following call uses this ID.
3. **Transcribe** — uploads the bundled sample audio (`sample/trouble-breathing.mp3`) as a
   recording, then runs async transcription against it.
4. **Extract facts** — turns the transcript text into discrete clinical facts.
5. **Generate note** — generates a structured SOAP note from those facts. Note that some sections may be empty. This is because the sample audio may not address those sections, and the model does not fabricate content that isn't in the source transcript.

A successful run ends with:

```
✓ Ambient scribe workflow completed successfully
```

followed by the generated note, section by section.

## Access token and interaction ID, briefly

- **Access token** — a short-lived OAuth token Corti issues via client-credentials auth. It's
  what authorizes every API call. This starter never surfaces it because `CortiClient` handles
  fetching and refreshing it internally when you give it `clientId`/`clientSecret`. In a real app you'll want to understand its lifetime and scopes (see
  [next-auth-examples](../../../sdk/typescript/next-auth-examples/) for all four Corti OAuth
  flows).
- **Interaction ID** — the identifier for one clinical encounter. Corti's API is
  interaction-scoped: recordings, transcripts, facts, and documents all attach to one. This
  starter creates one interaction per run and threads the same ID through every subsequent call. In a real app, you'd persist it for the duration of the encounter (and likely reuse it across a
  streaming session rather than a single file upload).

## What's next

This starter is intentionally narrow. For
production decisions, see:

- [`ambient/typescript/basic-example/`](../basic-example/) — live microphone streaming, single-mic
  and virtual-consultation (multi-channel) modes, real-time transcript/fact events.
- [`sdk/typescript/express-web-api/`](../../../sdk/typescript/express-web-api/) — a full REST API
  reference covering every SDK resource, including the non-deprecated `documents.generate()`
  guided-template flow (see its `guidedDocuments.ts` route) that this starter skips in favor of
  the simpler built-in `templateKey: "soap"` shorthand.
- [`sdk/typescript/next-auth-examples/`](../../../sdk/typescript/next-auth-examples/) — all four
  Corti OAuth flows (client credentials, ROPC, authorization code, PKCE).
- [Corti API documentation](https://docs.corti.ai)

## File structure

```
src/
  env.ts              # validates required env vars, actionable error messages
  corti.ts             # CortiClient factory (auth)
  steps/
    createInteraction.ts
    transcribeAudio.ts # upload recording + async transcription
    extractFacts.ts
    generateNote.ts    # facts -> structured document
  demo.ts               # orchestrates the steps above, logs progress
sample/
  trouble-breathing.mp3
```

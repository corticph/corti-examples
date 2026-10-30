# Corti SDK – TypeScript examples

TypeScript/JavaScript example applications demonstrating [`@corti/sdk`](https://www.npmjs.com/package/@corti/sdk).

| Project | Directory | Description |
|---------|-----------|-------------|
| **Express Web API** | [express-web-api/](express-web-api/) | Server-side REST API: token (client credentials, ROPC, auth code, PKCE), interactions, recordings, transcripts, facts, codes, templates, agents, agentic v2, documents (classic and guided), stream and transcribe WebSockets. Credentials via env. A Postman collection in the repo targets this API. |
| **Next auth examples** | [next-auth-examples/](next-auth-examples/) | Next.js app with four auth flows (client credentials, ROPC, authorization code, PKCE). You enter credentials in forms; after a successful token exchange the app shows a success view (token + interactions list). See the [security notice](next-auth-examples/README.md#security-notice) in that project’s README before using tokens on the client. |
| **Sandbox** | [sandbox/](sandbox/) | Local, documentation-style app of runnable applets across speech to text (dictation, ambient documentation, voice commands), text generation, medical coding, and agents. Each applet page pairs a writeup and its real source with a live demo against your own tenant. Use these along with the [documentation Guides](https://docs.corti.ai/stt/guides/overview) to bootstrap your build. |

## Getting started

Open the project you want and follow its README:

- [express-web-api/README.md](express-web-api/README.md)
- [next-auth-examples/README.md](next-auth-examples/README.md)
- [sandbox/README.md](sandbox/README.md)

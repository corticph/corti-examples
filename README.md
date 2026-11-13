# Corti Examples

Runnable, self-contained examples for building with the Corti API and the Corti SDKs
([@corti/sdk](https://www.npmjs.com/package/@corti/sdk) for TypeScript ·
[Corti.Sdk](https://www.nuget.org/packages/Corti.Sdk) for .NET).

Each example is a complete project with its own README and quick-start instructions. Read how it works, run it using your Corti API credentials, and lift the parts you need for your own integration.

**API reference:** [docs.corti.ai](https://docs.corti.ai) · **Credentials:** [Corti Console](https://console.corti.app)

## Where to start

- **Exploring what Corti can do** — run the [SDK sandbox](sdk/typescript/sandbox/) first: a browsable local
  app with dozens of runnable applets across speech to text, medical coding, text generation, and agents, each including a README and how it works writeup along with its source.
- **Wiring up the REST API** — [express-web-api](sdk/typescript/express-web-api/) (TypeScript) and
  [web-api](sdk/dotnet/web-api/) (.NET) are minimal reference implementations covering every endpoint group;
  they double as a validation tool when upgrading SDK versions.
- **Building a specific workflow** — pick your use case below.

## SDK reference

Reference implementations exercising every endpoint group of the Corti SDKs — auth, interactions,
recordings, transcripts, facts, codes, templates, agents, documents, and WebSocket streaming.

| Example | Stack | Description |
|---|---|---|
| [sdk/typescript/express-web-api/](sdk/typescript/express-web-api/) | TypeScript, Express | REST API covering all SDK features |
| [sdk/typescript/next-auth-examples/](sdk/typescript/next-auth-examples/) | TypeScript, Next.js | Standalone demos of all four Corti OAuth flows (client credentials, ROPC, auth code, PKCE) |
| [sdk/typescript/sandbox/](sdk/typescript/sandbox/) | TypeScript, React, Vite, Express | Browsable sandbox of runnable applets for speech to text, text generation, coding, and agents, each shown next to its source |
| [sdk/dotnet/web-api/](sdk/dotnet/web-api/) | C#, ASP.NET Core | Same scope as the Express example, in .NET |

## Embedded Assistant

The embedded assistant is a pre-built Web Component that runs a full clinical session — recording,
transcription, fact review, and documentation — inside your application. Your host app only handles
authentication and the interaction lifecycle.

| Example | Stack | Description |
|---|---|---|
| [embedded-assistant/react/basic-example/](embedded-assistant/react/basic-example/) | TypeScript, React 19, Vite | React integration using `@corti/embedded-react` |
| [embedded-assistant/vanilla-ts/basic-example/](embedded-assistant/vanilla-ts/basic-example/) | TypeScript | Web Component integration — no framework required |

## Ambient

Ambient scribing creates notes as a byproduct of clinical encounters, without requiring dictation: audio streams in real time,
facts are extracted as the conversation unfolds, and a document is generated at the end. Supports in-person
(single diarized microphone) and virtual (separate doctor/patient channels) consultations.

| Example | Stack | Description |
|---|---|---|
| [ambient/typescript/basic-example/](ambient/typescript/basic-example/) | TypeScript, Express | Single-mic or virtual consultation (doctor + patient channels); document generation from extracted facts |
| [ambient/typescript/web-component/](ambient/typescript/web-component/) | TypeScript, Express | Four demos of `@corti/ambient-web`: basic, custom UI, styling, and token refresh |

## Dictation

Dictation is intentional, clinician-directed speech: real-time transcription with interim results, spoken
punctuation, and voice commands for navigation and editing. It complements ambient workflows and augments EHR adoption and experience.

| Example | Stack | Description |
|---|---|---|
| [dictation/typescript/basic-example/](dictation/typescript/basic-example/) | TypeScript, Express | Microphone streaming via the Corti SDK; interim + final transcripts; voice commands |
| [dictation/typescript/web-component/](dictation/typescript/web-component/) | TypeScript, Express | Four demos of `@corti/dictation-web`: basic, custom UI, styling, and token refresh |
| [dictation/commands/](dictation/commands/) | JSON | Command configuration JSON (templates, dictation box, editing, lists, navigation, selection) |
| [dictation/replacements/](dictation/replacements/) | JSON | Replacements configuration JSON (numbered list items, Roman numerals) |

## Agents

The Agentic Framework examples integrate Corti agents into your own application: streamed chat replies
over the A2A protocol, a chat UI wired to a scoped document-search tool, and an MCP server exposing
document search with per-patient access control.

| Example | Stack | Description |
|---|---|---|
| [agents/react/next-agent-chat/](agents/react/next-agent-chat/) | TypeScript, Next.js, React | AI agent chat interface with A2A streaming, AI SDK integration, and real-time messaging |
| [agents/react/search-documents-ui/](agents/react/search-documents-ui/) | TypeScript, React, Express | React/Express chat UI provisioning a Corti agent wired to a scoped document-search MCP |
| [agents/typescript/search-documents-mcp/](agents/typescript/search-documents-mcp/) | TypeScript, MCP, Express | MCP server exposing a RAG document-search tool with per-patient access control |

## Proxy

Keep client credentials out of the browser. Browsers may call Corti directly with short-lived tokens
minted by your backend — the [sandbox](sdk/typescript/sandbox/) does exactly this for WebSocket streams and
transcript calls — but flows that authenticate with client credentials (token minting, management
endpoints) should go through a small server-side proxy. The proxy is also the right place for your own
access control, rate limiting, and logging.

| Example | Stack | Description |
|---|---|---|
| [proxy/javascript/basic-example/](proxy/javascript/basic-example/) | JavaScript, Express | WebSocket proxy — browser connects to proxy, proxy authenticates with Corti SDK |

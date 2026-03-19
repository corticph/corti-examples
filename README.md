# Corti Example Applications

Example applications for Corti products. Each project is self-contained with its own README and quick-start
instructions.

**Prerequisites:** A Corti account and API credentials from [Corti Console](https://console.corti.app).

---

## Use Cases

**[Embedded Assistant](#embedded-assistant)**

A pre-built Corti [Web Component](https://www.npmjs.com/package/@corti/embedded-web) that can be embedded directly into
any web application. The assistant manages the full clinical session experience — recording, transcription, fact review,
and documentation — so the host application only needs to handle authentication and interaction lifecycle.

**[Ambient Scribe](#ambient-scribe)**

Ambient scribing lets the system listen passively to a clinical encounter and automatically produce structured
documentation without requiring the clinician to dictate or type. Audio is streamed in real time, clinical facts are
extracted as the conversation unfolds, and a document is generated at the end. Can support both in-person (single
microphone with diarization) and virtual consultation (doctor and patient on separate audio channels).

**[Dictation](#dictation)**

Dictation gives clinicians direct control over the content, wording, and structure of their documentation through
speech. Unlike ambient scribing — where the system listens in the background — dictation is intentional: the provider
speaks directly into the record. Supports real-time transcription with interim results, spoken punctuation, and voice
commands for navigation and editing. Complements ambient workflows for specialties or situations where direct control is
preferred.

**[Proxy](#proxy)**

Corti APIs should never be called directly from the browser — doing so would expose client
credentials. Instead, route requests through a server-side proxy that authenticates with Corti on
behalf of the client. The proxy is also the right place to enforce your own access control, add
rate limiting, or inject logging.

**[SDK](#sdk)**

A reference showcase of the Corti
SDKs ([@corti/sdk](https://www.npmjs.com/package/@corti/sdk) · [Corti.Sdk](https://www.nuget.org/packages/Corti.Sdk))
covering every group of endpoints: auth flows, interactions, recordings, transcripts, facts, codes, templates, agents,
documents, and WebSocket streaming. Not real applications — intended as a practical guide for developers integrating
the SDK and as a validation tool when upgrading to a new SDK version.

---

### SDK

| Example                                                                  | Stack               | Description                                                                                |
|--------------------------------------------------------------------------|---------------------|--------------------------------------------------------------------------------------------|
| [sdk/typescript/express-web-api/](sdk/typescript/express-web-api/)       | TypeScript, Express | REST API covering all SDK features                                                         |
| [sdk/typescript/next-auth-examples/](sdk/typescript/next-auth-examples/) | TypeScript, Next.js | Standalone demos of all four Corti OAuth flows (client credentials, ROPC, auth code, PKCE) |
| [sdk/dotnet/web-api/](sdk/dotnet/web-api/)                               | C#, ASP.NET Core    | Same scope as the Express example, in .NET                                                 |

---

### Embedded Assistant

| Example                                                                                      | Stack                      | Description                                       |
|----------------------------------------------------------------------------------------------|----------------------------|---------------------------------------------------|
| [embedded-assistant/react/basic-example/](embedded-assistant/react/basic-example/)           | TypeScript, React 19, Vite | React integration using `@corti/embedded-react`   |
| [embedded-assistant/vanilla-ts/basic-example/](embedded-assistant/vanilla-ts/basic-example/) | TypeScript                 | Web Component integration — no framework required |

---

### Ambient Scribe

| Example                                                                              | Stack               | Description                                                                                              |
|--------------------------------------------------------------------------------------|---------------------|----------------------------------------------------------------------------------------------------------|
| [ambient-scribe/typescript/basic-example/](ambient-scribe/typescript/basic-example/) | TypeScript, Express | Single-mic or virtual consultation (doctor + patient channels); document generation from extracted facts |

---

### Proxy

| Example                                                                              | Stack               | Description                                                                     |
|--------------------------------------------------------------------------------------|---------------------|---------------------------------------------------------------------------------|
| [proxy/javascript/basic-example/](proxy/javascript/basic-example/)                   | JavaScript, Express | WebSocket proxy — browser connects to proxy, proxy authenticates with Corti SDK |

---

### Dictation

| Example                                                                              | Stack               | Description                                                                                  |
|--------------------------------------------------------------------------------------|---------------------|----------------------------------------------------------------------------------------------|
| [dictation/typescript/basic-example/](dictation/typescript/basic-example/)           | TypeScript, Express | Microphone streaming via the Corti SDK; interim + final transcripts; voice commands          |
| [dictation/typescript/web-component/](dictation/typescript/web-component/)           | TypeScript, Express | Four demos of `@corti/dictation-web`: basic, custom UI, styling, and token refresh           |

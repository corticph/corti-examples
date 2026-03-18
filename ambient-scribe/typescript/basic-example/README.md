# Corti AI Platform – Live Transcription & Fact-Based Documentation

A single demo app using the [`@corti/sdk`](https://www.npmjs.com/package/@corti/sdk) for **live audio transcription**, **fact extraction**, and **clinical document generation**. Toggle between two modes from the UI:

- **Single Microphone** – one audio source with automatic speaker diarization.
- **Virtual Consultation** – local microphone (doctor) + remote audio (patient) merged into a multi-channel stream. The remote audio can come from either a **WebRTC peer connection** or **screen/tab capture** (`getDisplayMedia`).

After a consultation ends, generate a structured clinical document from the extracted facts with a single click.

The demo is split into **server** (auth, interaction management, document generation) and **client** (audio capture, streaming, event display, document creation).

---

## Quick Start

**Prerequisites:** Node.js 18+

**Setup (3 steps):**

```bash
cp .env.example .env
# Edit .env with your Corti credentials (CORTI_TENANT_NAME, CORTI_CLIENT_ID, CORTI_CLIENT_SECRET)

npm install
npm run dev
```

Open http://localhost:3000 in your browser. Transcript and fact events appear in the browser console.

---

## Installation (Manual)

If setting up without npm:

```bash
npm i @corti/sdk express
npm i -D typescript ts-node @types/express @types/node
```

---

## File Structure

```
AmbientScribe/
  server.ts      # Server-side: OAuth2 auth, interaction creation, scoped token, document generation
  client.ts      # Client-side: stream connection, audio capture, event handling, document creation
  audio.ts       # Audio utilities: getMicrophoneStream(), getRemoteParticipantStream(), getDisplayMediaStream(), mergeMediaStreams()
  index.html     # Minimal UI with mode toggle, consultation controls, and document output
  README.md
```

---

## Server (`server.ts`)

Runs on your backend. Responsible for:

1. **Creating a `CortiClient`** with OAuth2 client credentials (never exposed to the browser).
2. **Creating an interaction** via the REST API.
3. **Minting a scoped stream token** (only grants WebSocket streaming access).
4. **Generating a clinical document** from the facts collected during a consultation.

```ts
import { CortiClient, CortiAuth, CortiEnvironment } from "@corti/sdk";

// Full-privilege client — server-side only
const client = new CortiClient({
  environment: CortiEnvironment.Eu,
  tenantName: "YOUR_TENANT_NAME",
  auth: { clientId: "YOUR_CLIENT_ID", clientSecret: "YOUR_CLIENT_SECRET" },
});

// Create an interaction
const interaction = await client.interactions.create({
  encounter: { identifier: randomUUID(), status: "planned", type: "first_consultation" },
});

// Mint a token scoped to streaming only
const auth = new CortiAuth({ environment: CortiEnvironment.Eu, tenantName: "YOUR_TENANT_NAME" });
const streamToken = await auth.getToken({
  clientId: "YOUR_CLIENT_ID",
  clientSecret: "YOUR_CLIENT_SECRET",
  scopes: ["streams"],
});

// Send interaction.id + streamToken.accessToken to the client
```

### Document Generation

After a consultation ends, the server fetches the extracted facts and generates a structured clinical document:

```ts
// 1. Fetch facts collected during the consultation
const facts = await client.facts.list(interactionId);

// 2. Create a document from the facts
const document = await client.documents.create(interactionId, {
  context: [
    {
      type: "facts",
      data: facts.map((fact) => ({
        text: fact.text,
        group: fact.group,
        source: fact.source,
      })),
    },
  ],
  template: {
    sections: [
      { key: "corti-hpi" },
      { key: "corti-allergies" },
      { key: "corti-social-history" },
      { key: "corti-plan" },
    ],
  },
  outputLanguage: "en",
  name: "Consultation Document",
  documentationMode: "routed_parallel",
});
```

---

## Audio Utilities (`audio.ts`)

Three methods for obtaining audio streams, plus a merge utility:

```ts
// 1. Local microphone
const micStream = await getMicrophoneStream();

// 2a. Remote participant from a WebRTC peer connection
const remoteStream = getRemoteParticipantStream(peerConnection);

// 2b. OR: screen / tab capture (alternative when you don't control the peer connection,
//     e.g. the video-call app runs in another browser tab)
const remoteStream = await getDisplayMediaStream();

// 3. Merge into a single multi-channel stream (virtual consultation mode)
const { stream, endStream } = mergeMediaStreams([micStream, remoteStream]);
```

---

## Client (`client.ts`)

Receives the scoped token + interaction ID from the server, then:

1. Creates a `CortiClient` with the stream-scoped token.
2. Connects via `client.stream.connect()`.
3. Acquires audio — just the mic in single mode, or mic + remote merged in virtual mode.
4. Streams audio in 200 ms chunks via `MediaRecorder`.
5. Logs transcript and fact events to the console.

```ts
const client = new CortiClient({
  environment: CortiEnvironment.Eu,
  tenantName: "YOUR_TENANT_NAME",
  auth: { accessToken },  // stream scope only
});

const streamSocket = await client.stream.connect({ id: interactionId });

// With a stream-scoped token, only streaming works:
// await client.interactions.list();  // Error — outside scope
// await client.transcribe.connect(); // Error — outside scope
```

### Single Microphone Mode

```ts
const microphoneStream = await getMicrophoneStream();
const mediaRecorder = new MediaRecorder(microphoneStream);
mediaRecorder.ondataavailable = (e) => streamSocket.send(e.data);
mediaRecorder.start(200);
```

### Virtual Consultation Mode

The remote audio source is selected from the UI — either a WebRTC peer connection or screen/tab capture:

```ts
const microphoneStream = await getMicrophoneStream();

// Option A: WebRTC
const remoteStream = getRemoteParticipantStream(peerConnection);

// Option B: Screen / tab capture (getDisplayMedia)
const remoteStream = await getDisplayMediaStream();

// channel 0 = doctor, channel 1 = patient
const { stream, endStream } = mergeMediaStreams([microphoneStream, remoteStream]);

const mediaRecorder = new MediaRecorder(stream);
mediaRecorder.ondataavailable = (e) => streamSocket.send(e.data);
mediaRecorder.start(200);
```

### Event Handling

```ts
streamSocket.on("transcript", (data) => console.log("Transcript:", data));
streamSocket.on("fact", (data) => console.log("Fact:", data));
```

---

## UI (`index.html`)

A minimal page with:

- Radio buttons to toggle between **Single Microphone** and **Virtual Consultation** mode.
- When **Virtual Consultation** is selected, a second radio group appears to choose between **WebRTC** and **Screen / tab capture** as the remote audio source.
- **Start Consultation** / **End Consultation** buttons to control the streaming session.
- **Create Document** button — enabled after a consultation ends. Calls the server to fetch facts and generate a clinical document, then displays the result on the page.
- Transcript and fact events are logged to the browser console.

---

## Production Build

For production deployment, compile and run the server:

```bash
npm run build      # Compile TypeScript to dist/
npm start          # Run compiled server
```

---

## Resources

- [`@corti/sdk` on npm](https://www.npmjs.com/package/@corti/sdk)
- [Corti API documentation](https://docs.corti.ai)

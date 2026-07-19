# Applet: Conversational agent

**Concept:** an always-on conversational voice agent backed by the Corti
**Agentic Framework**. Unlike the wake-command approach of the conversational
agent, the mic runs continuously and every completed utterance is sent to the
agent — no trigger phrase required.

The core UX idea is **speculative prefetch**: the agent fires a stateless
request during the user's speech (on the first stable interim result) so the
response is often ready the instant the user stops talking. A **response
debounce** window (default 1.5 s, configurable) prevents firing mid-sentence
by waiting for speech to genuinely pause before treating a turn as complete.

## Flow

1. Authenticate — `configureVoiceAgent` initialises the `CortiClient` and
   lazily creates the agent via `ensureAgent` on first use.
2. The user starts speaking. Interim transcripts arrive via
   `@corti/dictation-web`'s `transcript` event (`isFinal: false`).
3. On the **first** interim of a turn, `scheduleSpeculative` fires a 200 ms
   debounce and then calls `fireSpeculative` — a **stateless**
   `client.agents.messageSend` with no `contextId`. The response is held in
   `heldResponse` in module state, never written to the conversation thread.
4. Further interims extend the response-debounce timer and update the ghost
   bubble. `speculativeFiredThisTurn` ensures only one speculative call fires
   per turn.
5. When `isFinal: true` segments stop arriving for `responseDebounceMs` ms (or
   recording stops), `flushFinal` fires `handleFinal` with all buffered final
   segments joined.
6. `handleFinal`:
   - Cancels any in-flight speculative timer.
   - If a `heldResponse` is ready, immediately appends both the user message
     and a provisional assistant bubble (`pending: true`) to the UI, then
     calls `replaceProvisional` with the full final text.
   - If no `heldResponse` exists (agent was slow), appends the user message and
     fires `sendContextual` directly, showing a thinking spinner.
7. `replaceProvisional` / `sendContextual` call `sendAgentMessageWithContext`
   with the real `contextId` so the server thread stays coherent. The response
   replaces the provisional bubble in-place; `detectedMode` is updated from the
   `[MODE:key]` prefix (orchestrator mode only).

## Speculative prefetch — why stateless

The speculative call is made **without a `contextId`** so it never writes to
the real conversation thread. Partial interim text (e.g. "Dan Engel April")
would corrupt the thread if sent as a real turn. The provisional response is
shown immediately for perceived speed, then replaced in-place by the real
contextual response which has the full final text and full thread history.

## Response debounce

`VoiceAgent.tsx` buffers consecutive `isFinal: true` segments in
`finalBufferRef` and restarts a `responseDebounceMs` timer on every new event
(interim or final). When recording stops, `flushFinal` fires immediately so
there is no artificial delay at end-of-session. The timeout is user-configurable
via a slider in the details panel (0.5 – 3.0 s, persisted to `localStorage`).

## Preset system and orchestrator

Eight presets are defined in `model.ts`:

| Key | Label | Mode |
|-----|-------|------|
| `orchestrator` | Auto-detect | Default — detects use case from first message |
| `clinical` | Clinical assistant | Clinician clinical queries |
| `pharmacyTriage` | Pharmacy triage | Patient prescription refill |
| `appointmentScheduling` | Appointment scheduling | Patient scheduling |
| `patientIntake` | Patient intake | Pre-visit intake |
| `symptomTriage` | Symptom triage | Symptom triage and routing |
| `cpoeCapture` | CPOE capture | Clinician medication order entry |
| `patientEducation` | Patient education | Diagnosis/medication education |

When `orchestrator` is active, the system prompt instructs the LLM to prefix
every response with `[MODE:key]` on its own line. `extractMode()` in `agent.ts`
strips this tag before displaying the message and stores `detectedMode` in
state. `VoiceAgent.tsx` shows the resolved label in a pill at the top of the
chat window — updating live as the conversation evolves.

`applyPreset` persists the chosen key and calls `client.agents.update` to push
the new system prompt to the server. Reset the thread after switching presets to
start a clean context.

## Agent lifecycle

- `ensureAgent` finds an existing agent named **"Voice Agent"** or creates one.
- Prompt edits call `client.agents.update` — no recreation needed.
- A 404 on `messageSend` (stale or deleted agent) transparently recreates the
  agent and retries the turn without the stale `contextId`.

## Key files

- `agent.ts` — module-level singleton state; `useVoiceAgentStore`,
  `configureVoiceAgent`, `handleInterim`, `handleFinal`, `resetConversation`,
  speculative scheduling, `extractMode`, preset management.
- `VoiceAgent.tsx` — chat UI, ghost bubble, thinking spinner, response-debounce
  buffering, `CortiDictationComponent` wiring.
- `VoiceAgentDetails.tsx` — mode toggle, response-delay slider, provisional
  details toggle, system-prompt editor.
- `config.ts` — `buildVoiceConfig` (sets `interimResults: true`,
  `automaticPunctuation: false`, `audioEvents: { enabled: true }`).
- `model.ts` — `VoicePreset`, `VoiceMessage`, all eight system prompts,
  `ORCHESTRATOR_KEY`, `SPECIALIST_KEYS`, `DEFAULT_PRESET_KEY`.

## Dependencies to copy

- npm: `@corti/sdk`, `@corti/dictation-web`, `@lit/react`
- shared: `../_shared/cortiAgent.ts`, `../_shared/configStore.ts`,
  `../_shared/cortiDictationReact.tsx`, `../_shared/useCortiAccessToken.ts`
- local: `agent.ts`, `config.ts`, `model.ts`

## Gating

Requires the Corti Agentic Framework to be enabled for the project/region. A
403 from any agent call is surfaced as an error message in the UI.

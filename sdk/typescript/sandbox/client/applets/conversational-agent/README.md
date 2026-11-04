# Applet: Conversational agent

**Concept:** an always-on conversational voice agent backed by the Corti
**Agentic Framework**. Unlike the wake-command approach, the mic runs
continuously and every completed utterance is sent to the agent — no trigger
phrase required. Responses stream incrementally via SSE for minimal latency.

## Flow

1. Authenticate — `configureConversationalAgent` initialises the
   `CortiClient` and lazily creates the agent via `ensureAgent` on first use.
2. The user starts speaking. Interim transcripts arrive via
   `@corti/dictation-web`'s `transcript` event (`isFinal: false`) and update a
   ghost bubble in the chat.
3. When `isFinal: true` segments stop arriving for `responseDebounceMs` ms (or
   recording stops), `flushFinal` fires `handleFinal` with all buffered final
   segments joined.
4. `handleFinal` appends the user message and calls `streamResponse`, which
   uses `streamAgentMessageWithContext` to stream the agent's reply via SSE.
   A placeholder assistant message is created and updated in-place as chunks
   arrive — the text appears token-by-token in the chat panel.
5. The orchestrator prompt instructs the LLM to prefix every response with
   `[MODE:key]` on its own line. `extractMode()` strips all mode tags from
   the text before displaying and stores `detectedMode` in state. The resolved
   specialist label appears in a pill at the top of the chat window.

## Turn merging

STT can send multiple `isFinal` segments for a single utterance (with gaps
of 100s of ms). A post-response continuation window (2× `responseDebounceMs`)
detects when new speech is part of the same turn. In that case the new text is
merged into the last user message, the stale assistant response is removed,
and the stream restarts with the merged text.

## Preset system and connectors

Eight presets are defined in `model.ts`:

| Key                     | Label                  | Connectors      |
| ----------------------- | ---------------------- | --------------- |
| `orchestrator`          | Auto-detect            | —               |
| `clinical`              | Clinical assistant     | `pubmed-expert` |
| `pharmacyTriage`        | Pharmacy triage        | `posos-expert`  |
| `appointmentScheduling` | Appointment scheduling | —               |
| `patientIntake`         | Patient intake         | —               |
| `symptomTriage`         | Symptom triage         | —               |
| `cpoeCapture`           | CPOE capture           | `coding-expert` |
| `patientEducation`      | Patient education      | —               |

Specialist presets attach registry connectors at agent creation/update time
via `client.agentic.agents.update`. The agent's system prompt tells it when to
invoke each connector (e.g. "use the PubMed connector to search for evidence").

A **connectors toggle** in the details view (default on) controls whether
connectors are included in the agent spec. Disabling it removes connectors
from the agent update call — useful for comparing latency with and without
connector overhead.

When `orchestrator` is active, the system prompt instructs the LLM to detect
the use case from the first message and route accordingly.

`applyPreset` persists the chosen key and calls `client.agentic.agents.update`
to push the new system prompt and connectors to the server. Reset the thread
after switching presets to start a clean context.

## Agent lifecycle

- Agent uses model `corti-s1` with lifecycle `persistent`.
- `ensureAgent` finds an existing agent named **"Conversational Agent"** or
  creates one.
- Prompt and connector edits call `client.agentic.agents.update` — no
  recreation needed.
- A 404 on stream (stale or deleted agent) transparently recreates the agent
  and retries the turn without the stale `contextId`.
- Reset calls `client.agentic.contexts.delete(contextId)` to clear the
  server-side thread.

## Key files

- `agent.ts` — module-level singleton state; `useConversationalAgentStore`,
  `configureConversationalAgent`, `handleInterim`, `handleFinal`,
  `resetConversation`, streaming via `streamResponse`, `extractMode`, preset
  management.
- `ConversationalAgent.tsx` — chat UI, ghost bubble, streaming display with
  cursor indicator, turn-debounce buffering, `CortiDictationComponent` wiring,
  debug log panel (session config, stream events, mode detection) with
  expandable rows, copy, and download JSON.
- `ConversationalAgentDetails.tsx` — mode toggle, turn mode, connectors
  toggle, external agent ID, specialist presets, system-prompt editor.
- `config.ts` — `buildVoiceConfig` (sets `interimResults: true`,
  `automaticPunctuation: false`, `audioEvents: { enabled: true }`).
- `model.ts` — `VoicePreset` (with `connectors`), `VoiceMessage`, all eight
  system prompts, `ORCHESTRATOR_KEY`, `SPECIALIST_KEYS`, `DEFAULT_PRESET_KEY`.

## Dependencies to copy

- npm: `@corti/sdk`, `@corti/dictation-web`, `@lit/react`
- shared: `../_shared/cortiAgent.ts`, `../_shared/configStore.ts`,
  `../_shared/cortiDictationReact.tsx`, `../_shared/useCortiAccessToken.ts`
- local: `agent.ts`, `config.ts`, `model.ts`

## Debug log

A debug log panel sits below the live demo (not in the details view). Each
row is expandable to show full untruncated text. Buttons: copy (plain text),
download JSON, clear. Events logged:

- `session_config` — agent name, model, lifecycle, preset, turn mode,
  connectors enabled, connector names, system prompt preview. Fires on
  prepare and reset.
- `interim` — interim STT transcript text
- `final_flushed` — final transcript text sent to the agent
- `turn_merged` — merged user text when speech continues mid-response
- `agent_stream_start` — text sent to the agent
- `agent_stream_chunk` — each SSE delta from the stream
- `agent_stream_done` — final response text with latency
- `agent_error` — error message from a failed stream
- `mode_detected` — detected orchestrator mode key
- `audio_event` — audio event type from dictation

## Authentication

Uses standard Corti API client credentials. A 403 from any agent call is
surfaced as an error message in the UI.

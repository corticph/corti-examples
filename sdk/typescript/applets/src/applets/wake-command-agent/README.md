# Applet: Wake-command agent

**Concept:** a chat-style clinical agent backed by the Corti **Agentic Framework**,
driven by typed input or a voice **wake command**. The live microphone listens
continuously; only utterances that begin with a recognized wake phrase ("ok
Corti ...", "hey Corti ...", "Corti ...") are routed to the agent — all other
STT output is discarded.

The agent maintains a **threaded context** across turns within a session. Each
turn is a `client.agents.messageSend(id, message, { contextId })` call that
returns an updated `contextId`; subsequent turns pass the same id so the agent
remembers prior messages. Resetting the conversation deletes the server-side
context and clears local state.

## Flow

1. Authenticate — the applet calls `configureConversation` with the active token
   on every auth change.
2. On first use the agent is lazily created via `ensureAgent` and its id cached
   in `ConfigStore` per `clientId:tenant`.
3. Send a turn:
   - **Typed:** type in the composer, press Enter or click **Send**.
   - **Voice:** keep the mic running; say "ok Corti [intent]". If _auto-send_
     is on the intent is sent immediately; otherwise it lands in the composer
     for review before sending.
4. The response is appended to the chat as an assistant message and the
   `contextId` is persisted so the thread survives a page reload.
5. **Reset thread** deletes the server-side context and wipes local messages.

## Wake-command mechanics

`config.ts` registers a single command (`conversational_agent_wake`) with four
phrase patterns (`ok Corti {intent}`, `okay Corti {intent}`, `hey Corti
{intent}`, `Corti {intent}`). The `{intent}` wildcard captures everything after
the wake word. `model.extractWakeIntent` falls back to stripping the wake prefix
from `rawTranscriptText` when the variable is empty.

The dictation stream runs with `interimResults: false` — transcripts arrive only
when finalized. All transcripts are logged to the debug panel; only wake-command
transcripts are forwarded to the agent.

## Agent lifecycle

- `ensureAgent` finds an existing agent named **"Sandbox Conversational Clinical
  Agent"** or creates one.
- When the system prompt is edited and saved, `client.agents.update` patches the
  live agent in place — no recreation needed.
- A 404 on `messageSend` (stale `agentId` or deleted agent) triggers a
  transparent recreation and retries the turn without the stale `contextId`.

## Key files

- `agent.ts` — module-level singleton state, `useConversationStore`,
  `configureConversation`, `sendText`, `handleWakeCommand`, `resetConversation`.
- `ConversationalAgent.tsx` — chat UI, composer, dictation component, wake
  command wiring.
- `ConversationalAgentDetails.tsx` — system-prompt editor, debug transcript log.
- `config.ts` — `buildConversationalConfig` (wake phrases, keyterms, dictation
  params).
- `model.ts` — `ConversationMessage` / `DebugEntry` types, `extractWakeIntent`,
  `appendDebugEntry`, `clearConversationState`.

## Dependencies to copy

- npm: `@corti/sdk`, `@corti/dictation-web`, `@lit/react`
- shared: `../_shared/corti-agent.ts`, `../_shared/config-store.ts`,
  `../_shared/corti-dictation-react.tsx`, `../_shared/useCortiAccessToken.ts`
- local: `agent.ts`, `config.ts`, `model.ts`

## Gating

Requires the Corti Agentic Framework to be enabled for the project/region. A
403 from any agent call is surfaced as an error message in the UI.

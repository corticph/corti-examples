# Applet: Second-pass agent

**Concept:** upload or reuse a recorded audio file, generate an offline
`/transcripts` transcript, then run a second-pass **Agentic Framework** prompt
over the finalized transcript.

The second-pass agent applet is two layers:

- **transcript runner** — interactions, recordings, transcript creation, status
  polling, transcript fetch, JSON export, and display flattening. This layer is
  the shared engine in
  [`../_shared/transcript-runner`](../_shared/transcript-runner); the applet
  composes it.
- **agentic augmentation** — a persisted system prompt plus one isolated agent
  run over the finalized transcript. This layer is the applet's own.

## Flow

1. Choose an audio source:
   - upload a new file
   - or select an existing recording from an interaction
2. Set the core `/transcripts` parameters:
   - `primaryLanguage`
   - `isDictation`
   - `isMultichannel`
   - `diarize`
3. Edit the agent prompt if needed, then click **Generate**
4. The applet:
   - creates or selects the interaction
   - uploads the recording when needed
   - calls `POST /interactions/{id}/transcripts/` with `async: true`
   - polls `/status` until the transcript is complete
   - fetches the finalized transcript
   - shows the raw transcript as one concatenated string
   - sends a speaker-aware flattened transcript to the second-pass agent
   - shows the second-pass agent output

The transcript stays visible even if the agent step fails: the agent run is the
runner's `secondPass`, and the runner preserves the finalized transcript on a
second-pass error.

## Agent behavior

- The agent library is stored per API client (`clientId:tenant`) and managed in
  the details card. Each entry defines a name and system prompt — pick which one
  to apply from the dropdown in the live demo.
- The agent is created lazily on first use (model `corti-s1-mini`, lifecycle
  `persistent`) and updated in place when the selection changes — one platform
  agent with a swapped prompt, not one per library entry.
- Each second-pass run is isolated: `client.agentic.agents.sendMessage(...)` is called
  without a context id.

## Key files

- `SecondPassAgent.tsx` — composes the shared runner (form + result cards) and
  wires the agent selector + second-pass output panel
- `SecondPassAgentDetails.tsx` — agent library editor / reset / export
- `agent.ts` — second-pass agent lifecycle and selection
- `agentLibrary.ts` — agent library store, selection, and built-in catalog
- `AgentLibraryEditor.tsx` — agent library management UI (name + prompt editor)
- `model.ts` — speaker-labelled flattening for the agent input
- `README.md` — behavior + composition notes

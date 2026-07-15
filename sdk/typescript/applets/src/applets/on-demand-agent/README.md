# Applet: On-demand agent (agentic copy-edit)

**Concept:** a command that runs the dictated text through a Corti **Agentic
Framework** agent for a minimal spelling/grammar/punctuation copy-edit — making
existing content readable and standards-adherent **without** rewording or
changing meaning. The user triggers it _on demand_.

Dictate into the editor, then say **“copy edit”** (or click **Run copy-edit**).
The text is sent to a copy-editor agent and the editor is replaced with the
result.

## Agent lifecycle (mirrors Tympany)

- On first use, `client.agents.list()` looks for an agent named
  “Sandbox Copy Editor”; if absent, `client.agents.create({ name,
description, systemPrompt, experts: [] })` makes one. The id is cached per
  **API client** (`clientId:tenant`) via the `ConfigStore` seam.
- A copy-edit calls `client.agents.messageSend(id, { message: … })` with no
  `contextId` (each call isolated) and reads the text from
  `task.status.message.parts[].text` (fallback: artifacts).
- The minimal-edit behavior lives entirely in the **system prompt** in
  `agent.ts` — edit it there.

## Gating

Requires the Corti Agentic Framework to be enabled for the project/region. An
authorized-but-not-entitled client returns **403**, surfaced in the UI.

## Key files

- `agent.ts` — agent spec (prompt) + `useCopyEditStore` hook (ensure/cache/run).
- `OnDemandAgent.tsx` — dictation editor + copy-edit command/button.
- `OnDemandAgentDetails.tsx` — agent/prompt/lifecycle/gating info.
- `../_shared/corti-agent.ts` — `ensureAgent` / `sendAgentMessage` helpers.

## Dependencies to copy

- npm: `@corti/sdk`, `@corti/dictation-web`, `@lit/react`
- shared: `../_shared/corti-agent.ts`, `../_shared/config-store.ts`,
  `../_shared/corti-dictation-react.tsx`, `../_shared/editor-adapter.ts`,
  `../_shared/text-insertion.ts`, `../_shared/useActiveControl.ts`,
  `../_shared/useCortiAccessToken.ts`
- local: `agent.ts`, `config.ts`

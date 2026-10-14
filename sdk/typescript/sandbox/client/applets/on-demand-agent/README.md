# Applet: On-demand agent (agentic copy-edit)

**Concept:** a command that runs the dictated text through a Corti **Agentic
Framework** agent for a minimal spelling/grammar/punctuation copy-edit — making
existing content readable and standards-adherent **without** rewording or
changing meaning. The user triggers it _on demand_.

Dictate into the editor, then say **“copy edit”** (or click **Run copy-edit**).
The text is sent to a copy-editor agent and the editor is replaced with the
result.

## Agent lifecycle

- On first use, `client.agents.list()` looks for an agent named
  “Sandbox Copy Editor”; if absent, `client.agents.create({ name,
description, systemPrompt, experts: [] })` makes one. The id is cached per
  **API client** (`clientId:tenant`) via the `ConfigStore` seam.
- A copy-edit calls `client.agents.messageSend(id, { message: … })` with no
  `contextId` (each call isolated) and reads the text from
  `task.status.message.parts[].text` (fallback: artifacts).
- The behavior lives entirely in the **system prompt**, and there is a library
  of them in `prompts.ts` — each with a title and the dictation language it was
  written for. `resolveActivePrompt` picks the one matching the current
  dictation language unless the user pinned one; `setActivePrompt` then installs
  it on the single cached agent via `client.agents.update`. A prompt is only
  correct for its own language, so an English copy-editor prompt will happily
  "correct" Danish text into English — hence the pairing rather than one global
  prompt.

## Authentication

Uses standard Corti API client credentials. A **403** response is surfaced in
the UI with guidance to verify the token scope, tenant, and environment.

## Key files

- `agent.ts` — agent lifecycle + `useCopyEditStore` hook (ensure/cache/run/revert).
- `prompts.ts` — the prompt library (title + language) and its selection rules.
- `OnDemandAgent.tsx` — dictation editor + copy-edit command/button.
- `OnDemandAgentDetails.tsx` — agent/prompt/lifecycle/gating info.
- `../_shared/cortiAgent.ts` — `ensureAgent` / `sendAgentMessage` helpers.

## Dependencies to copy

- npm: `@corti/sdk`, `@corti/dictation-web`, `@lit/react`
- shared: `../_shared/cortiAgent.ts`, `../_shared/configStore.ts`,
  `../_shared/cortiDictationReact.tsx`, `../_shared/editorAdapter.ts`,
  `../_shared/textInsertion.ts`, `../_shared/useActiveControl.ts`,
  `../_shared/useCortiAccessToken.ts`
- local: `agent.ts`, `config.ts`

# Applet: My Note Style

**Concept:** a clinician generates a note from a transcript, edits it, and
the applet learns from those edits — storing them as template prompt
overrides so the next generation matches the clinician's style and rules
without manual editing. This is the "learn from edits to generated output"
loop (as opposed to _Scribe like me_, which learns from historical notes).

## Pipeline

1. **Generate** — `client.documents.generate` produces a note from a
   transcript against a Corti Standard template (no overrides, baseline).
2. **Edit** — the clinician edits the generated note section by section in
   the main panel (editable textareas, one per section).
3. **Store to memory** — for each changed section, the My Note Style Memory
   agent (`client.agents.*`) receives:
   - The section heading and its current template prompts (`contentPrompt`,
     `writingStylePrompt`, `miscPrompt`)
   - The original generated text vs. the edited text (the diff)
   - The prompt updates previously learned for that section (from earlier
     edit cycles — the agent merges them into its new proposal)

   The agent interprets the edit and routes it to the right prompt surface:
   - **Writing style** — phrasing, terseness, abbreviation usage →
     `writingStylePrompt` override
   - **Content** — what clinical information belongs in the section →
     `contentPrompt` override
   - **Rules** — non-negotiable instructions ("always include medication
     dosages") → `miscPrompt` in a "Very important rules" block

   The clinician doesn't need to think about classification — the agent
   handles it. Clinicians can also add a rule manually from the memory log
   panel without going through an edit cycle. Trivial edits (typo fixes and
   similar) are detected by the agent and skipped — nothing is learned from
   them.

4. **Regenerate & compare** — the same transcript is generated twice in
   parallel: once with no overrides (baseline) and once with the accumulated
   memory applied as runtime `templateRef.overrides`. The side-by-side
   comparison shows how much the learning changed the output.

Memory entries persist to `localStorage` (namespaced per API client/tenant)
and accumulate across cycles. Each cycle only captures _new_ edits since the
last store (original snaps to edited after each store) — and each proposal is
the COMPLETE replacement text for its prompt surface, merged with the
previously learned rules for that surface, with the newest edit winning on
conflicts. Applied overrides therefore use only the newest proposal per
(section, prompt surface), plus the manual "Very important rules" that the
newest proposal has not yet folded in.

> **Note:** each entry also stores the full original and edited section text
> (clinical content) in `localStorage` indefinitely — fine for a sandbox PoC,
> but not a production pattern for clinical data.

## Key design decisions

- **Client-side diff** — the diff between original and edited text is
  computed in React state (string comparison), not via the `PATCH /documents`
  endpoint. The learning from the diff is what matters for this PoC.
- **One agent** — diff interpretation is a single-step task; no multi-agent
  pipeline is needed.
- **No MCP skills** — template prompts are passed inline in the agent
  message body (same pattern as scribe-like-me). The agent gets everything
  it needs in one message.
- **Runtime overrides** — memory is applied as `templateRef.overrides` on
  every `generate` call, never mutating the base template. Per section and
  prompt surface only the newest learned proposal is applied (it already
  merges its predecessors), alongside manual rules not yet folded in.
- **Two-column fullscreen layout** — input column on the left (template
  selector, transcript, generate/learn/regenerate controls), clinical note
  on the right (wider), memory log as a collapsible panel on the far right.

## Dependencies to copy

- npm: `@corti/sdk`
- shared files: `../_shared/cortiAgent.ts`, `../_shared/corti-documents.ts`
  (for `OUTPUT_LANGUAGES`), `../_shared/configStore.ts`,
  `../_shared/useCortiAccessToken.ts`
- local files: `agent.ts`, `documents.ts`, `memoryStore.ts`

## Future opportunities

- **Server-side PATCH** — persist the edited document via
  `PATCH /documents/{documentId}` before sending the diff to the agent, so
  the edited note is stored server-side.
- **MCP skills** — give the agent access to the template-section-authoring
  skill from `docs.corti.ai/mcp` and the textgen MCP for full template prompt
  retrieval.
- **`outputSchema` overrides** — currently the agent only proposes
  `contentPrompt`, `writingStylePrompt`, and `miscPrompt` overrides.
  A more complete version could also adjust `outputSchema` node descriptions
  and reorder sections via `orderIndex`.
- **Durable custom templates** — convert accumulated overrides into a
  permanent inheriting template (as scribe-like-me does via
  `documents.sections.create` + `documents.templates.create`).
- **Incremental learning** — the agent already receives the section's
  previously learned rules; a compact, running style summary could replace
  ever-growing replacement texts once the rule history gets long.

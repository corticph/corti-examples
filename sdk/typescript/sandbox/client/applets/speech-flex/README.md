# Applet: Speech Flex

**Concept:** dual-mode clinical workspace — clinicians flex between dictation (self-entry via `/transcribe`) and ambient (conversational capture via `/streams`) against the same patient interaction.

A visit schedule (Corti interactions sorted by scheduled date) anchors both modes. A toggle switch below the mic control switches the recording and recognition behavior while keeping the visit context constant.

## Layout

The editor (`DictationPanel`) is wrapped in a collapsible section. Mode toggling changes only the mic control in the header; the editor, collapsible transcript/facts panels, and note generation card stay put.

Right column, top to bottom:

1. **Dictation editor** — contentEditable surface with toolbar (bold, italic, undo/redo, cleanup, copy, clear). Collapsible. Draft text is persisted per-interaction (see Storage).
2. **Recording status bar** (ambient mode + visit selected) — live recording indicator with clip chips.
3. **Collapsible transcript panel** (visit selected) — has two modes toggled by a button pair: **Ambient** (live diarized transcript grouped by speaker runs) and **Paste** (textarea for pasting a plain-text transcript, parsed into diarized segments). Pasted text flows through the same rendering and note-generation paths as live ambient output. Paste state clears on visit change.
4. **Collapsible facts panel** (visit selected + facts enabled) — grouped facts with discard/restore, inline edit, and add-new-fact. Discarded facts are excluded from note generation.
5. **Note generation** — template picker + output language + generate button + "preserve dictated text verbatim" toggle. Multiple notes per visit, collapsible, copyable.

## Generating notes

Notes use `client.documents.generate()` (`POST /documents`). Six context-source modes are available (configurable in the config dialog under the Ambient tab):

| Source                             | What gets sent                                                                                      | API path                            |
| :--------------------------------- | :-------------------------------------------------------------------------------------------------- | :---------------------------------- |
| **Combined** (default)             | Dictation + ambient transcript segments + non-discarded facts, all as an explicit `context[]` array | `context` (mixed types)             |
| **Combined (dictation + ambient)** | Dictation + ambient transcript segments only (no facts)                                             | `context` (mixed types)             |
| **Interaction**                    | The interaction ID only — the server pulls attached transcripts + facts                             | `interactionId`                     |
| **Editor text only**               | Just the dictation editor content                                                                   | `context: [{ type: "text" }]`       |
| **Ambient only**                   | Explicit ambient transcript segments                                                                | `context: [{ type: "transcript" }]` |
| **Facts only**                     | Non-discarded facts only                                                                            | `context: [{ type: "facts" }]`      |

`context` and `interactionId` are mutually exclusive in the Corti API. The "Combined" mode is the most flexible — it mixes whatever is available (dictation, transcript, facts) into a single `context` array. See the [Guided Documents docs](https://docs.corti.ai/textgen/documents-guided-synthesis#input-context).

### Preserve dictated text verbatim

When enabled (checkbox next to the Generate button, only active when the source includes editor text), the dictated text is prepended as a verbatim section client-side — no extra API call. A single standard generation call is made with the user's selected template, and the verbatim [heading, text] pair is unshifted onto the result. The section heading is the selected template's name with parenthetical suffixes stripped.

When the toggle is off (or the source doesn't include editor text), the standard generation call is made as before.

Templates are filtered by the spoken language (BCP 47 primary subtag matching). Generic templates (empty `languages` array) always pass. The default template preference is persisted per-user in localStorage.

**Template deduplication.** The `deduplicateTemplates()` helper in `corti-documents.ts` runs on the raw template list before language filtering. The API returns Corti standard templates that share a name but target different markets (e.g. "Emergency Note" for en-US vs en-GB, "soap-notat" for nb-NO vs nn-NO vs da). When multiple templates share a name, the helper scores them (non-auto-generated: +10, non-inherited: +5) and keeps the highest-scoring. If the top two score equally and differ by specialty, region, or language, both are kept but the non-primary one gets a distinguishing suffix in parentheses (e.g. "Emergency Note (en-US)"). Both `NoteGeneration` and `DocumentGeneratorApplet` use this deduplication.

## Configuration

The config dialog (wrench icon in the header) has five tabs:

- **Commands** — voice commands for the dictation endpoint (`/transcribe`). Uses `CommandManager` from the shared commands applet.
- **Replacements** — server-side phrase rewrites in the final transcript (e.g. "BID" → "twice daily"). Uses `RuleManager` + `replacementStore`.
- **Dictionary** — custom vocabulary that biases speech recognition. Uses `RuleManager` + `termStore`.
- **Cleanup** — prompts for the copy-editor agent used by the "Run cleanup" button in the editor toolbar. Uses `CleanupPromptLibrary`. Prompts are resolved by spoken language or pinned.
- **Ambient** — facts extraction toggle (enables `mode: { type: "facts" }` vs `mode: { type: "transcription" }`) and the document generation source radio selector described above.

## Storage

All persistence uses `localStorage` with per-tenant/per-client namespacing via `identityNamespace(clientId, tenant)`.

### Editor drafts (`interactionDraft.ts`)

Editor content is persisted as HTML + text, namespaced by client + tenant + interactionId. Each visit keeps its own independent draft. The editor represents a patient chart, so content swaps when the visit changes:

| Transition                   | Editor content                          | Old store               | New store                      |
| :--------------------------- | :-------------------------------------- | :---------------------- | :----------------------------- |
| No visit → Visit (no draft)  | Stays (transfers to visit)              | Cleared                 | Gets the content               |
| No visit → Visit (has draft) | Replaced with visit's draft             | Keeps unaffiliated text | Draft restored                 |
| Visit A → Visit B            | Replaced with B's draft (or cleared)    | Saves A's content       | Draft restored or empty        |
| Visit → No visit             | Replaced with global draft (or cleared) | Saves visit's content   | Global draft restored or empty |

A "no-visit" (global) namespace holds unaffiliated text typed without a visit selected. If the user then selects a visit that has no saved draft, the unaffiliated text transfers to that visit and the global store is cleared (so it doesn't reappear on deselection). If the visit already has a draft, the unaffiliated text stays in the global store for when the visit is deselected.

### Other storage

- **Settings** (`speech-flex.settings`) — facts enabled flag + document source. Read/written via `loadSettings` / `saveSettings` in `SpeechFlexConfig.tsx`.
- **Default template** (`speech-flex.defaultTemplate`) — last-selected template ID, persisted in `NoteGeneration.tsx`.
- **Document IDs** (`speech-flex.docIds`) — generated note document IDs keyed by `clientId:tenant:interactionId`. Since `context` and `interactionId` are mutually exclusive, documents generated with explicit context (the "combined" default) are not linked to the interaction server-side. This store tracks which document IDs belong to which interaction so they can be fetched via `client.documents.get()` on page reload.
- **Commands, replacements, dictionary terms, cleanup prompts** — shared stores (`commandStore`, `replacementStore`, `termStore`, prompt store) scoped by `setIdentity(clientId, tenant)`. Shared across all applets for the same client.

### Ambient state

Ambient segments, facts, and clips are owned by `SpeechFlex.tsx` (in-memory React state, not persisted). They survive mode toggles (dictation ↔ ambient) but are cleared when the interaction changes. Existing interaction transcripts (fetched with `full: true` to get segment data), facts, and notes are fetched from the server in a single pass when the visit is selected (tracked by `fetchedRef`).

## Build Phases

- **Phase 1:** skeleton + mode switching + visit schedule + conditional web component mounting.
- **Phase 2:** dictation editor (reused from Dictation Suite) with draft persistence per interaction.
- **Phase 3:** ambient recording with clip tracking and live diarized transcript.
- **Phase 4:** note generation — template selection, `client.documents.generate()`, and EHR-ready output.
- **Phase 5:** config dialog (commands, replacements, dictionary, cleanup prompt, ambient settings with facts toggle and document source selector) + facts UI (discard, edit, add) + document generation from interaction / transcript / facts.
- **Phase 6:** agent features — dictation cleanup (copy-editor agent) with editable prompt from config dialog, revert support.
- **Phase 7:** UX refactor — editor always visible (the "EHR"), collapsible transcript/facts panels, recording status bar, combined context for note generation (editor text + transcript + facts as explicit `context[]`), patient-context-scoped editor content transfer.
- **Phase 8:** paste-transcript mode (Ambient/Paste toggle in the transcript panel, parsed into diarized segments), "preserve dictated text verbatim" toggle (parallel-call architecture), `combined-no-facts` document source, collapsible dictation editor.

## Future opportunities

- Further improve UX and feature functionality by utilizing embedded assistant components.
- Add support for audio archive.
- Integrate with a more complete DemoEHR for expansion of functionality related to patient context awareness and note transfer.

## Dependencies

- npm: `@corti/sdk`, `@corti/dictation-web`, `@corti/ambient-web`, `@lit/react`
- shared files: `../_shared/cortiDictationReact.tsx`, `../_shared/cortiAmbientReact.tsx`, `../_shared/useCortiAccessToken.ts`, `../_shared/useDictationLanguage.ts`, `../_shared/sessionState.tsx`, `../_shared/diarizedTranscript.ts`, `../_shared/corti-documents.ts`, `../_shared/configStore.ts`, `../_shared/RuleManager.tsx`, `../_shared/editorAdapter.ts`, `../_shared/useActiveControl.ts`
- applet dependencies: `../dictation-commands/` (command store + manager), `../dictation-suite/` (suite config + editor history), `../dictionary-terms/` (term store), `../text-replacements/` (replacement store), `../on-demand-agent/` (copy-editor agent + prompts)
- local files: `workspaceState.ts`, `useInteractions.ts`, `VisitSchedule.tsx`, `interactionDraft.ts`

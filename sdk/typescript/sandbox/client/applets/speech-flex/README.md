# Applet: Speech Flex

**Concept:** dual-mode clinical workspace — clinicians flex between dictation (self-entry via `/transcribe`) and ambient (conversational capture via `/streams`) against the same patient interaction.

A visit schedule (Corti interactions sorted by scheduled date) anchors both modes. A mode toggle in the capture bar switches the recording and recognition behavior while keeping the visit context constant.

## Layout

Runs as a full-viewport clinical app (the registry declares `demoPlacement: "fullscreen"`, so the sandbox serves it at `/:workflow/:applet/fullscreen` instead of embedding it in the docs card). A TopBar (logo · app label · config · exit) sits above the capture bar (mic control · mode pills · recording status), then three panels:

- **Left rail** — patient context + visit schedule. The patient context block shows the selected visit's identity (name, MRN, encounter type, scheduled time, interaction id) with an inline edit form (pencil), a single-click delete button (trash), and a clear button. The visit schedule lists interactions sorted by scheduled date (newest first) with patient name, encounter type, time, and MRN per row; a **New visit** form (expanded below the schedule heading — patient name, MRN, datetime) creates schedule entries, and selecting a visit anchors both capture modes. Interactions created without patient data get a deterministic fallback name (see `visitPatientName` in `workspaceState.ts`).
- **Main panel** — the "EHR" column, top to bottom:
  1. **Dictation editor** — contentEditable surface with toolbar (bold, italic, undo/redo, cleanup, copy, clear). Collapsible. Draft text is persisted per-interaction (see Storage).
  2. **Recording status bar** (ambient mode + visit selected) — live recording indicator with clip chips.
  3. **Collapsible transcript panel** (visit selected) — has two modes toggled by a button pair: **Ambient** (live diarized transcript grouped by speaker runs) and **Paste** (textarea for pasting a plain-text transcript, parsed into diarized segments). Pasted text flows through the same rendering and note-generation paths as live ambient output. Paste state clears on visit change.
  4. **Collapsible facts panel** (visit selected + facts enabled) — grouped facts with discard/restore, inline edit, and add-new-fact. Discarded facts are excluded from note generation.
- **Right panel** — note generation card: template picker, output language, source selector, per-section source toggles, and the generated-notes list.

Mode toggling changes only the mic control in the capture bar; the editor, collapsible transcript/facts panels, and note generation card stay put.

## Generating notes

Notes use `client.documents.generate()` (`POST /documents`). Five context-source modes are available (the Source dropdown in the note generation panel; the selection persists via settings):

| Source                 | What gets sent                                                                                                                        | API path                                        |
| :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------- |
| **Combined** (default) | Per-section source control — Dictation (verbatim), Ambient, and/or Facts per section                                                  | `context` (mixed types)                         |
| **Interaction**        | The interaction ID only — the server pulls attached transcripts + facts                                                               | `interactionId`                                 |
| **Dictation only**     | The dictation editor content, routed verbatim into every template section by the Dictation Router agent — no document-generation call | `Dictation Router` agent (no `/documents` call) |
| **Ambient only**       | Explicit ambient transcript segments                                                                                                  | `context: [{ type: "transcript" }]`             |
| **Facts only**         | Non-discarded facts only                                                                                                              | `context: [{ type: "facts" }]`                  |

`context` and `interactionId` are mutually exclusive in the Corti API. See the [Guided Documents docs](https://docs.corti.ai/textgen/documents-guided-synthesis#input-context).

One edge case: with **Combined** or **Dictation only** selected but the template sections not yet loaded, generation falls back to a full-template call with the dictation text as `context: [{ type: "text" }]`.

### Combined mode: per-section source control

When the source is **Combined**, a table appears with each template section and three independent toggles: **Dictation**, **Ambient**, and **Facts**. Default: Ambient on, Dictation and Facts off.

- **Dictation only** → that section is filled with the dictated text verbatim. A **Dictation Router** agent (`dictationRouter.ts`) classifies which dictated sentences belong to which section — by sentence index only, never rewriting text — so each section receives its relevant sentences verbatim. Sentences placed in no verbatim section are surfaced as "unallocated" after generation.
- **Dictation + Ambient and/or Facts** → the AI generates the section from ambient/facts, then a **Dictation Merger** agent (`dictationMerger.ts`) compares the dictated sentences with the AI-generated content. If the dictation covers all relevant points, only the dictation is kept. If partial, the agent weaves the dictated text (verbatim) together with the AI content to fill the gaps. After merging, each dictated sentence is verified as a substring of the output; if the agent rephrased anything, the section falls back to concatenation.
- **Ambient and/or Facts (no Dictation)** → that section is AI-generated. The AI context always includes the dictation text (for full understanding); Ambient and/or Facts are included when any AI or merge section requests them.
- **All three OFF** → the section is omitted from the generated note.

If every section has Dictation on and Ambient/Facts off, no API call is made at all — the note is built entirely from routed dictation. If some sections need AI generation (merge or AI-only), a single assembly call generates those sections (verbatim-only and all-off sections are excluded from the assembly). On routing-agent failure — or when the router completes but places no sentence in any Dictation section — the Dictation sections fall back to the full dictation so dictated text never silently vanishes from the note. On merge-agent failure, merge sections fall back to concatenation (dictated text + AI content).

Templates are filtered by the spoken language (BCP 47 primary subtag matching). Generic templates (empty `languages` array) always pass. The default template preference is persisted per-user in localStorage.

**Template deduplication.** The `deduplicateTemplates()` helper in `corti-documents.ts` runs on the raw template list before language filtering. The API returns Corti standard templates that share a name but target different markets (e.g. "Emergency Note" for en-US vs en-GB, "soap-notat" for nb-NO vs nn-NO vs da). When multiple templates share a name, the helper scores them (non-auto-generated: +10, non-inherited: +5) and keeps the highest-scoring. If the top two score equally and differ by specialty, region, or language, both are kept but the non-primary one gets a distinguishing suffix in parentheses (e.g. "Emergency Note (en-US)"). Both `NoteGeneration` and `DocumentGeneratorApplet` use this deduplication.

## Configuration

The config dialog (wrench icon in the TopBar) has six tabs:

- **Commands** — voice commands for the dictation endpoint (`/transcribe`). Uses `CommandManager` from the shared commands applet.
- **Replacements** — server-side phrase rewrites in the final transcript (e.g. "BID" → "twice daily"). Uses `RuleManager` + `replacementStore`.
- **Dictionary** — custom vocabulary that biases speech recognition. Uses `RuleManager` + `termStore`.
- **Cleanup** — prompts for the copy-editor agent used by the "Run cleanup" button in the editor toolbar. Uses `CleanupPromptLibrary`. Prompts are resolved by spoken language or pinned.
- **Formatting** — how dates, times, numbers, measurements, and ordinals appear in transcript output; applies to both capture modes.
- **Facts** — facts extraction toggle (enables `mode: { type: "facts" }` vs `mode: { type: "transcription" }` in ambient streams) and the "Interaction (server-side)" source visibility toggle. The active document source itself is chosen in the note generation panel's Source dropdown and persisted via settings.

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

- **Settings** (`speech-flex.settings`) — facts-enabled flag, "Interaction (server-side)" source visibility, document source, and formatting preferences. Read/written via `loadSettings` / `saveSettings` in `SpeechFlexConfig.tsx`.
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
- **Phase 9:** full-screen clinical app redesign — TopBar + capture bar + three-panel layout (left rail: patient context + visit schedule; main: editor + transcript/facts; right: note generation) per the Corti clinical design language; visit lifecycle management (create via the New visit form, edit, delete); runs on its own route.

## Future opportunities

- Further improve UX and feature functionality by utilizing embedded assistant components.
- Add support for audio archive.
- Integrate with a more complete DemoEHR for expansion of functionality related to patient context awareness and note transfer.

## Dependencies

- npm: `@corti/sdk`, `@corti/dictation-web`, `@corti/ambient-web`, `@lit/react`
- shared files: `../_shared/cortiDictationReact.tsx`, `../_shared/cortiAmbientReact.tsx`, `../_shared/useCortiAccessToken.ts`, `../_shared/useDictationLanguage.ts`, `../_shared/sessionState.tsx`, `../_shared/diarizedTranscript.ts`, `../_shared/corti-documents.ts`, `../_shared/configStore.ts`, `../_shared/RuleManager.tsx`, `../_shared/editorAdapter.ts`, `../_shared/useActiveControl.ts`
- applet dependencies: `../dictation-commands/` (command store + manager), `../dictation-suite/` (suite config + editor history), `../dictionary-terms/` (term store), `../text-replacements/` (replacement store), `../on-demand-agent/` (copy-editor agent + prompts)
- local files: `workspaceState.ts`, `useInteractions.ts`, `VisitSchedule.tsx`, `PatientContext.tsx`, `TopBar.tsx`, `interactionDraft.ts`, `kit.tsx`, `pastedTranscript.ts`, `dictationRouter.ts`, `dictationMerger.ts`

# Sandbox applets

Each applet is a **self-contained example implementation of one concept** using
the Corti SDK (`@corti/sdk`) and/or the dictation and ambient web components
(`@corti/dictation-web`, `@corti/ambient-web`), wrapped for React with
`@lit/react`.

## Applets

Grouped as in the sidebar. [`registry.ts`](registry.ts) is the source of truth
for titles, descriptions, and order.

### Speech to Text

| Applet | Concept |
| --- | --- |
| [Dictation suite](dictation-suite/) | Every dictation feature on one editor, one microphone, one config |
| [Speech Flex](speech-flex/) | Providing clinicians the ability to seamlessly flex between self entry dictation and conversational audio capture |
| [Languages](languages/) | Per-endpoint language availability (client.languages.list()) |
| [Raw SDK mic](dictation-sdk/) | Host-managed microphone with @corti/sdk directly |
| [Rich-text insertion](dictation-richtext/) | Casing and spacing at the rich-text caret boundary |
| [Formatting playground](formatting/) | Configure formatting preferences and compare options side-by-side |
| [Text replacements](text-replacements/) | Find/replace rules applied to the final transcript |
| [Dictionary terms](dictionary-terms/) | Bias recognition toward defined dictionary terms |
| [Dictation commands](dictation-commands/) | Respond to recognized command phrases with editor actions |
| [App control](app-control/) | Navigate and control app UI by voice |
| [Dictation box](dictation-box/) | Target a dictation box, then transfer text to the active editor |
| [Device buttons](device-buttons/) | Map handheld-mic buttons (SpeechMike) to recording |
| [Audio archive](dictation-audio-archive/) | Capture dictation microphone audio and store it locally |
| [File transcription](file-transcription/) | Offline /transcripts from uploaded or archived audio |
| [Conversational transcript](ambient-diarized/) | Chronological, speaker-grouped /streams transcript |
| [Recording to transcript (REST)](recording-transcript/) | Upload a recording, create an async transcript, and poll it to completion |
| [Playback highlighting](playback-highlighting/) | Word-level transcripts synced to audio playback with real-time highlighting, command detection, and multi-recording sequencing |

### Text Generation

| Applet | Concept |
| --- | --- |
| [SOAP note generator](soap-note-generator/) | Template-based SOAP note from transcript or dictation |
| [Discharge summary builder](discharge-summary/) | EHR-ready discharge summary from admission notes |
| [Referral letter generator](referral-letter/) | Structured referral letter from a visit note or transcript |
| [Procedure note generator](procedure-note/) | Specialty-adaptable procedure note from dictation |
| [Template showdown](template-showdown/) | Fire one note through every tenant template simultaneously and compare outputs |
| [Two-note comparison](note-diff/) | Generate the same template for two notes and view sections side-by-side |
| [Batch note processor](batch-processor/) | Process multiple notes in parallel with one template using --- separators |

### Medical Coding

| Applet | Concept |
| --- | --- |
| [Note-to-code assistant](note-to-code/) | ICD-10-CM code suggestions with confidence ranking |
| [Code crosswalk assistant](code-crosswalk/) | Map codes across ICD-10-CM, SNOMED CT, CPT, and more |
| [Evidence-based coding](evidence-coding/) | Auditable code predictions with source-text evidence spans |
| [Code validation checker](code-validator/) | Compare proposed codes against API predictions: confirmed, missed, and unsupported |
| [Multi-encounter code tracker](encounter-tracker/) | Code matrix across multiple visits — spot persistent, emerging, and resolved diagnoses |
| [Live encounter to coded output](medical-coding-live/) | Coding a finalized note (client.codes.predict) |
| [Batch coding with a review queue](medical-coding-batch/) | Coding a document backlog, filtered and aggregated |

### Agentic

| Applet | Concept |
| --- | --- |
| [Multi-agent chart prep](chart-prep-workflow/) | Extract facts → draft note → suggest codes (3-agent pipeline) |
| [Prior-auth workflow](prior-auth-workflow/) | Organize context → justify → format PA request |
| [QA reviewer workflow](qa-reviewer-workflow/) | Draft → review for gaps → propose revisions |
| [On-demand agent](on-demand-agent/) | On-demand agent copy-edit for typed or dictated text |
| [Second-pass agent](second-pass-agent/) | Audio-file transcript plus agentic second pass |
| [Wake-command agent](wake-command-agent/) | Wake-command gated chat UI with threaded agent memory |
| [Conversational agent](conversational-agent/) | Always-on voice chat with speculative prefetch for instant responses |
| [Command Genie](command-genie/) | Describe a command or nudge in plain language — an agent builds it for you |

### Extended workflows

| Applet | Concept |
| --- | --- |
| [Multi-source FactsR extraction](facts-multisource/) | Facts across several documents (client.facts.extract) |
| [Human approval checkpoint](hitl-checkpoint/) | An agent proposes; a human approves before it acts |
| [Role-scoped multi-agent build](multi-agent-roles/) | Front desk vs clinical notes, scoped mcpServers |
| [Narrow-tool specialist network](multi-agent-specialists/) | One capability per expert, inline and registry |
| [Scribe like me](scribe-like-me/) | Two agents tailor a template to a clinician's style from their historical notes |
| [Real-time nudge](real-time-nudge/) | Subtle 'chirps' bring feedback via SNOMED-CT and ICD-10-CM code prediction, grammar matching, and agent-assisted evaluation |

## Shared foundation (`_shared/`)

The reusable integration layer. The editor and dispatch seams are
framework-agnostic, so they are the part to copy when building your own app or
hardware integration.

**Auth and SDK access**

- `authContext.tsx`: `AppletAuthProvider`, the auth seam every applet depends on.
- `useCortiAccessToken.ts`: host-auth adapter returning `authConfig` and
  `sdkEnvironment` for `CortiClient` and the web components. Swap it for your
  own token source.
- `urls.ts`: REST base (`/api/corti` proxy) and WebSocket base URLs.
- `examplesAnalytics.ts`: the `analytics` tag passed to every `CortiClient`.

**Web components**

- `cortiDictationReact.tsx` / `cortiAmbientReact.tsx`: `@lit/react` wrappers
  for `<corti-dictation>` and `<corti-ambient>`.
- `DictationField.tsx`: a textarea plus `<corti-dictation>` that inserts final
  segments at the caret.
- `useDictationLanguage.ts`: the global dictation language, persisted in
  localStorage.

**Editing and commands**

- `editorAdapter.ts`: `EditorAdapter` over a `<textarea>` or contenteditable
  surface, the seam a native integration would reimplement.
- `useActiveControl.ts`: tracks the last-focused editable control as an
  adapter.
- `textInsertion.ts`: casing and spacing rules at the insertion boundary.
- `offsetMap.ts`: keeps tracked text ranges valid across dictation, commands,
  and typing.
- `commandDispatch.ts`: maps `command` events (enum or wildcard variables) to
  editor actions.
- `appControlAdapter.ts`: the application-control counterpart of
  `EditorAdapter`, for non-text actions such as navigation.
  `nativeHostAdapter.ts` sketches the desktop equivalent and is intentionally
  not implemented.
- `formatting.ts`: `/transcribe` formatting configuration.

**Transcripts and audio**

- `diarizedTranscript.ts`: time-ordering for diarized `/streams` segments.
- `transcript-runner/`: the offline `/transcripts` runner (state hook, REST
  helpers, model, and UI) shared by file transcription and the second-pass
  agent.
- `audioArchive.ts` / `audioArchiveStore.ts` / `useAudioArchive.ts`: local
  audio archive (types, IndexedDB store, active-session hook).

**Devices**

- `dictationDevice.ts` / `useDictationDevice.ts` / `hidRecording.ts`: WebHID
  handheld microphones (SpeechMike, Foot Control, PowerMic) and the mapping
  from button state to recording actions.

**Corti API helpers**

- `corti-documents.ts` and `DocumentGeneratorApplet.tsx`: document generation
  and templates, plus the generator shared by the SOAP, discharge, referral, and
  procedure applets.
- `corti-codes.ts` and `CodingSettings.tsx`: medical coding helpers and
  settings.
- `cortiAgent.ts`: thin helpers over the Agentic Framework (`client.agents.*`).

**State and configuration**

- `configStore.ts`: localStorage persistence namespaced per API client.
- `ruleStore.ts` and `RuleManager.tsx`: persistence and UI for rule lists such
  as replacements and terms.
- `sessionState.tsx`: in-memory state that survives navigating between applets.

## Portability

Applet components depend only on (a) the npm packages, (b) an injected token via
`_shared/useCortiAccessToken.ts`, and (c) the `_shared` helpers above. Applets
that have their own `README.md` list what to copy to lift them into a standalone
example. Shared logic lives once in `_shared/` to avoid drift.

The SDK and web components derive `environment` (cluster) and `tenantName` by
decoding the JWT `iss` (`https://auth.<cluster>.corti.app/realms/<tenant>`), so
they work against any cluster, including non-prod, with only a token.

## Adding an applet

1. Create `client/applets/<id>/` with the applet component.
2. Add one entry to `registry.ts`; this puts it in the sidebar.
3. Optionally, add its source files to `sources.ts` and a writeup to
   `writeups.ts` so the docs page shows them.
4. Pass `analytics: EXAMPLES_ANALYTICS` to any `new CortiClient(...)`.

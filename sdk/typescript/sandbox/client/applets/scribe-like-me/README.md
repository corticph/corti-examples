# Applet: Scribe like me

**Concept:** a clinician uploads their own historical notes; two Corti
Agentic Framework agents review them and tailor an out-of-the-box Guided
Documents template to match their style; the same transcript can then be run
through multiple tailored personas (plus the untailored baseline) to see how
much the tailoring actually changes the generated note.

This applet supports **personalized prompt overrides layered over a resolved
schema, rather than becoming a schema-authoring system itself**. The resolved
`outputSchema` and inherited `miscPrompt` are supplied to the tailoring agent
as read-only compatibility context; the applet never proposes or applies an
`outputSchema` or `miscPrompt` override.

## Pipeline

1. **Scribe Style Reviewer** (`client.agents.*`) reads a persona's historical
   notes and writes a prose style summary.
2. **Scribe Template Tailor** takes that summary plus a shortlist of resolved
   Corti Standard templates (`client.documents.templates.list/get`) and
   returns a JSON tailoring plan: which template fits best, and a
   `contentPrompt`/`writingStylePrompt` override per section. Each candidate
   also carries its inherited `miscPrompt` and a compact summary of its fully
   resolved `outputSchema`; those fields are read-only compatibility context,
   not additional override surfaces. If its template choice is a poor
   structural fit (e.g. it merges two sections the clinician's notes keep
   distinct), step 2's "change template" picker re-runs just this step against
   a clinician-chosen template instead — passing a candidate list of exactly
   one item, which structurally guarantees the result targets that template
   rather than relying on the prompt alone.
3. Generation (`client.documents.generate`) applies that plan as runtime
   `templateRef.overrides` — Corti's "Path 2" pattern — so the base template
   is never mutated. Generating without overrides against the same template
   produces the out-of-the-box baseline for comparison.
4. Optionally, **Save as custom template** turns that same plan into durable
   resources instead: `client.documents.sections.create` (one per overridden
   section, `inheritFromId` the base section) then one
   `client.documents.templates.create` referencing those plus the untouched
   base sections. Generation then targets that template id directly, with no
   runtime overrides. **Download JSON** returns the identical two-request
   recipe without calling the API.

Both agents are generic and stateless (isolated messages, no `contextId`):
the role lives in the systemPrompt, persona data travels in the message body.
This is the same shape as `chart-prep-workflow`'s 3-stage pipeline, just two
stages. Both prompts are editable from the details panel (same pattern as
`second-pass-agent`/`wake-command-agent`) — saving pushes the change to the
live agent via `client.agents.update`.

## Dependencies to copy

- npm: `@corti/sdk`, `@corti/ambient-web`, `@lit/react`
- shared files: `../_shared/cortiAgent.ts`, `../_shared/corti-documents.ts`
  (for `OUTPUT_LANGUAGES`), `../_shared/cortiAmbientReact.tsx`,
  `../_shared/configStore.ts`, `../_shared/sessionState.tsx`,
  `../_shared/useCortiAccessToken.ts`, `../_shared/useDictationLanguage.ts`,
  `../_shared/utils.ts` (for `downloadJson`)
- shadcn/ui: `@/components/ui/dialog` (confirm dialogs for destructive
  actions — restoring sample personas)
- local files: `agent.ts`, `documents.ts`, `personaStore.ts`, `seedPersonas.ts`
- host integration: `createInteraction()` (`POST /interactions`, via
  `useAuth()`) for the live-capture path in step 3.

## Notes

- Generated note sections are ordered by walking `profile.sections` (the
  template's own order, resolved with inheritance when the candidate was
  fetched), not by `Object.entries()` on the API's `stringDocument` — object
  key order reflects wire/serialization order, not the template's intended
  section sequence, so relying on it made rendered notes read out of order.
- Both agent prompts are editable from the details panel; each is persisted
  to `localStorage` per API client and, once that agent exists, saving (or
  resetting) pushes the change live via `client.agents.update`. Since
  `ensureAgent` matches an existing agent by *name*, a tenant that already
  created "Scribe Style Reviewer"/"Scribe Template Tailor" before a prompt
  change lands in this repo keeps running the old prompt until someone saves
  or resets from this editor once — only a brand-new agent picks up a new
  default automatically.
- Candidate templates are restricted to Corti Standard templates
  (`source: "corti"`) so the demo is self-contained regardless of what's
  already defined in the tenant.
- Tailoring defaults to ephemeral runtime overrides (Path 2), applied fresh
  on every `generate` call with nothing persisted server-side. Step 2 also
  offers **Save as custom template**, which materializes the same overrides
  as real, durable resources — one `documents.sections.create` per
  overridden section (`inheritFromId` the base section) plus one
  `documents.templates.create` referencing those alongside the untouched
  base sections — after which generation targets that template id directly.
  **Download JSON** exports the identical two-step request recipe without
  calling the API, for inspecting or transporting to another Corti
  project/tenant.
- The four seed personas (pediatrics, internal medicine, psychiatry,
  colorectal surgery) deliberately span both documentation-style axes
  (terse/telegraphic vs. narrative/formal) and note-type axes (general
  encounter notes vs. psychotherapy session narratives vs. surgical
  preop/procedure notes) — "create new persona" walks through the same
  upload flow for a real clinician's notes. A "Restore samples" action in
  step 1 resets to a fresh copy of these four if `seedPersonas.ts` changes
  after a browser has already seeded once (personas otherwise persist to
  `localStorage` untouched).

## Future opportunities

The following improvements are intentionally deferred. They fit better in a
production implementation with durable server-side state than in this
browser-local sandbox:

- **DB-backed inheritance and version tracking.** Persist each style
   profile's source template/version, resolved section versions, saved custom
   resources, and ownership metadata. Before generation or re-saving, compare
   that provenance with the currently published parents and require
   re-tailoring when section membership or inherited generation behavior has
   materially changed. A full implementation should also manage deletion and
   cleanup of custom templates and sections so partially created or abandoned
   resources do not become orphans. Continue using `inheritFromId` rather than
   copying the parent's `outputSchema`: inheritance is the correct API model,
   while the database supplies the provenance and lifecycle controls missing
   from this proof of concept.
- **Deterministic override review.** Add a lightweight validation layer that
   warns when an override mixes content routing with writing style, asks for a
   shape that conflicts with the resolved schema, duplicates headings or list
   markers already rendered by the schema, contains oversized instructions,
   or uses empty strings where `null` should mean "inherit." Start with
   explainable warnings and reserve blocking errors for definite structural
   incompatibilities.
- **First-class multilingual personalization.** Store the language and region
   of the historical-note corpus alongside the persona, select a compatible
   template variant, and learn language-specific phrasing and abbreviations
   rather than applying an English-derived style profile to translated output.
   A production database should retain locale-specific profiles and their
   template/version provenance so one clinician can have independently
   reviewed styles for multiple languages or regions.

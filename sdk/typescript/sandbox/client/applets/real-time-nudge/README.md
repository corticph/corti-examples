# Applet: Real-time nudge

**Concept:** subtle, in-flow CDI "chirps" during documentation. As the
clinician types or dictates, the nudge engine watches their cadence and
surfaces non-blocking feedback when a documentation gap is detected — CHF
without type or acuity, diabetes without type, CKD without a stage. Not
hard-stop alerts, just gentle reminders to add specificity.

## Architecture

The editor debounces changes for three seconds. Text-only rules evaluate locally.
Code rules call `client.codes.predict()`, then the code evaluator. Prompt rules
run through a separate evaluator concurrently with prediction. Results accumulate
for a single note/rule/connection/prompt-revision snapshot before the client
combines criteria. Independent rules can complete without waiting for unrelated
criteria. Editing rules or settings schedules reevaluation without additional typing.
While the prediction + agent pipeline is in flight, new cadence events are
suppressed and the latest text is queued; a single re-evaluation starts when
the pipeline completes.

Each service stage runs one request at a time and keeps only the latest queued
input. Identical pending requests share work even when result caching is disabled.
Older responses cannot update current nudges. Token refresh and equivalent callback
recreation do not invalidate an evaluation. Status indicators track actual pending
work; prediction status ends before code-agent evaluation begins.

### Criterion protocol

Both agents return `decisions[]`, with one result per requested criterion:
`id`, `outcome` (`matched`, `not-matched`, or `unknown`), and optional
`evidence`. `explanation` is optional (v4 contracts instruct agents to omit it).
Matched prompts require a `message`. Code conditions use colon-delimited
identifiers like `ruleId:trigger:snomed:0` or `ruleId:resolve:prompt`; the
code agent's response contract (v4) includes evidence references (`codeIndex`,
`evidenceIndexes`); the prompt agent uses a separate contract (v4) without
code-specific fields. Both contracts instruct the agent to return only JSON —
never prose, refusals, or explanations. Trigger and resolve are independent.

**Client-side pre-evaluation:** `op: "="` exact-match criteria are evaluated
client-side — the agent never sees them. Only `is-a` and `descendent-of`
criteria (which require hierarchy reasoning) are sent to the agent. This
reduces agent criteria from 14 to 2–4 in typical configurations, cutting
agent latency by 60–80%.

The client combines conditions within each system and then criteria across systems,
text, and prompts using the configured `all`/`any`. Missing decisions, invalid
responses, failures, and disabled evaluation paths remain unknown. Resolution wins
when confirmed. A rule whose trigger is not-matched is removed regardless of
resolve status; a rule whose trigger is matched but resolve is unknown stays
unknown (nudge suppressed until resolve is determined). Retained nudges are
preserved internally during re-evaluation; disabled/deleted rules disappear
immediately. Agent failures are logged to the debug log.

Code evidence consists of references into the supplied predictions and evidence
spans. The client validates IDs, coding systems, exact-match semantics, and indexes.
It never substitutes the first predicted code as supporting evidence. The
descendent-of self-check only applies to `present` conditions (an `absent matched`
decision with spurious evidence is not downgraded). Hierarchy and clinical context
remain model interpreted: coding MCP integration is still the top future
opportunity, not part of this change.

### Nudge state injection

Both agents receive a `nudgeState` snapshot — `{ triggered, resolved, dismissed }`
arrays of rule IDs — in every request. This gives the agent awareness of which
nudges are already active without requiring conversation history. The agent
evaluates only the criteria and codes supplied in the current message;
`nudgeState` is reference, not instruction. Requests are stateless: no
`contextId` is sent, so each request creates a fresh, isolated server-side
context. This eliminates latency growth from accumulated conversation history.

### Rule model

```typescript
interface NudgeRule {
  id: string;
  title: string;
  message: string;
  trigger: RuleCriteria;
  resolve: RuleCriteria;
  enabled: boolean;
}

interface RuleCriteria {
  textMatch?: TextMatchCriteria;  // conditions + mode (any|all) + none
  snomed?: SnomedCriteria;         // SNOMED-CT: conditions (code, op, condition) + mode
  icd10?: Icd10Criteria;           // ICD-10-CM: conditions (code, op, condition) + mode
  prompt?: PromptCriteria;         // custom evaluation prompt for agent
  mode?: "all" | "any";            // cross-criteria AND/OR (default: all)
}
```

**Text criteria** use a grammar model in `contains` values:
- `[optional]` — bracketed word is optional in a phrase
- `(A|B|C)` — alternation: one of the pipe-separated options must match
- `(textMatch.conditions)` — self-reference to the rule's own trigger conditions
- Space-separated groups are AND-ed
- `groups` + `minGroups` — named criterion groups with a count threshold

**SNOMED and ICD-10 criteria** use conditions with a code, operator (`=`,
`is-a`, `descendent-of`), and present/absent requirement, combined with
`all`/`any` mode. Both are evaluated by the same agent, with condition combinations handled locally.

**Prompt criteria** use a free-text evaluation instruction (max 500 chars)
sent to a separate prompt evaluator agent with a fixed system prompt. The
agent returns a `message` per matched criterion, shown as a dynamic nudge
message when the rule has no static `message`.

**Cross-criteria mode** (`RuleCriteria.mode`) controls how multiple criteria
types combine: `"all"` (AND, default) or `"any"` (OR).
### Prediction coverage

`buildPredictParams` selects SNOMED, ICD-10-CM, or both according to enabled rules
and settings. All predictions are unfiltered so concepts referenced only by
absence conditions cannot be excluded by a present-only filter. Empty successful
predictions still reach the agent for absence evaluation. Absence means no
applicable code in the returned evidence, not proof the patient lacks the
condition. Candidates are treated the same as confirmed codes for `op: "="`
exact-match pre-evaluation — the predict API's candidate suggestions are
trusted for string-equality lookups. `is-a` and `descendent-of` criteria that
require hierarchy reasoning are always sent to the agent. Alternatives are not
included in the agent payload.

### Caching and lifecycle

- Memory-only LRU caches: 20 successful responses per service stage, five-minute TTL.
- Keys include actual serialized request payload and active prompt/protocol revision;
  caches and agent initialization are scoped to environment, tenant and client/session.
- Invalidation advances a generation. Older requests cannot repopulate the cache.
- Failures and unknown/incomplete agent results are not cached.
- Cache agent results controls completed-response reuse, not in-flight sharing.
- **Stateless requests (no context threading):** both code and prompt agents
  use `sendAgentMessage` (stateless) — no `contextId` is sent. Each request
  creates a fresh, isolated server-side context. The `nudgeState` snapshot
  provides cross-evaluation awareness without conversation history. This
  eliminates latency growth from accumulated messages and simplifies error
  recovery (no 404 retries, no context expiry). Remaining latency growth
  tracks input size (note text + code count), not context accumulation.
- **Prompt versioning:** `DEFAULT_PROMPT_VERSION` (currently 7) discards
  stored prompts on version mismatch, replacing them with the built-in
  default. Legacy namespace fallback has been removed — it caused stale
  custom prompts to survive version bumps.
- **In-flight suppression:** while the predict + code agent pipeline is
  running, new cadence events are queued (not evaluated). When the pipeline
  completes, if text changed, a single re-trigger evaluation starts with the
  latest text. This eliminates the 92% evaluation discard rate seen during
  continuous dictation. Append-only diff (contextId threading) was explored
  and reverted — live testing showed it was slower than stateless full-text
  at every turn and impossible to use during continuous dictation.
- Agent initialization and prompt updates are serialized. A new editable prompt is
  activated and persisted only after its remote update succeeds. Existing saved
  prompts are retained, with the mandatory v4 output contract appended.
- Prediction can be aborted on invalidation. Already-running SDK agent calls finish
  before the latest queued request begins; obsolete results are discarded.

### Diagnostics

Debug exports include evaluation IDs, paired request/response IDs, cache hits,
shared requests, queue replacements, discarded evaluations, evaluation
suppression and re-trigger events, and agent/prompt failure messages. The UI
shows incomplete-rule counts alongside request status and errors.

## File structure

```
client/applets/real-time-nudge/
  RealTimeNudge.tsx          # Main component (editor + nudge panel + rule editor + prompt editor + debug log)
  RealTimeNudgeDetails.tsx  # "How it works" reference card
  NudgeConfig.tsx            # Config dialog (commands, replacements, dictionary, formatting, code systems + agent)
  NudgeRuleEditor.tsx        # Structured query builder for nudge rules
  evaluation.ts             # Criterion IDs, three-state decisions, response/evidence validation
  requestStage.ts           # Bounded queue and cache
  nudgeEngine.ts             # Rule evaluation logic (text + SNOMED/ICD-10 agent + prompt)
  nudgeRules.ts              # Rule types, seed rules, rule store
  grammar.ts                 # Grammar evaluator for contains expressions
  cadenceDetector.ts         # Cadence event detection
  useNudges.ts               # React hook: debounce, evaluate, nudge state
  predictCodes.ts            # SDK wrapper around client.codes.predict()
  snomedAgent.ts             # Agent transport (SNOMED + ICD-10 + prompt evaluator), prompt management, debug log
  nudgeEngine.test.ts        # Tests (105 total across 7 test files)
  cadenceDetector.test.ts    # Tests
```

## Dependencies to copy

- npm: `@corti/sdk`, `@corti/ambient-web`, `@lit/react`
- shared files: `../_shared/cortiAgent.ts` (agent helpers),
  `../_shared/cortiDictationReact.tsx`, `../_shared/editorAdapter.ts`,
  `../_shared/configStore.ts`, `../_shared/sessionState.tsx`,
  `../_shared/ruleStore.ts`, `../_shared/useCortiAccessToken.ts`,
  `../_shared/useDictationLanguage.ts`, `../_shared/utils.ts`
- shadcn/ui: `@/components/ui/button`, `@/components/ui/dialog`,
  `@/components/ui/popover`

## Notes

- SNOMED and ICD-10 predict use `client.codes.predict()` via the SDK. The
  system identifiers (`snomedctint`, `icd10cm-outpatient`) are cast to
  `Corti.CommonCodingSystemEnum[]` at the call boundary since the SDK's enum
  does not include SNOMED-CT variants.
- The agent is created via `ensureAgent` (matches by name "Nudge Code
  Evaluator") and evaluates both SNOMED and ICD-10 criteria. Sent as
  stateless messages (no `contextId`). Its system prompt is editable from
  the UI, persisted per API client, and pushed live via
  `client.agents.update`. Reset restores the built-in default.
- A separate "Nudge Prompt Evaluator" agent handles custom prompt criteria.
  Its system prompt is fixed (not user-editable) and versioned — auto-updated
  on existing agents when the built-in prompt changes. It uses a response
  contract without code/evidence fields.
- A debug log card shows timestamped entries for predict request/response
  (with full request body), agent request/response, prompt request/response,
  and nudge state changes. Entries are expandable (full text or JSON).
  Export as JSON. Rolling 100-entry buffer.
- Built-in rules can be viewed in read-only mode (Eye button) but not
  edited. Custom rules use the structured `NudgeRuleEditor` with collapsible
  trigger/resolve sections, add/remove condition rows, mode selectors, and
  SNOMED/ICD-10 operator dropdowns. Add-component dropdown supports text
  matching, SNOMED criteria, ICD-10 criteria, and custom prompt.
- SNOMED code details on nudge cards are shown in a popover (info button)
  with predicted code, supporting evidence, and scrollable alternative codes.
  SNOMED browser and ICD-10 index links in the rule editor toolbar.
- Ten seed rules: CHF specificity (text), CHF specificity (SNOMED, code
  84114007, `=`/`descendent-of` operators), CHF specificity (ICD-10, codes
  I50.9 `=` → resolves on I50.21–23/I50.31–33/I50.41–43 `=`),
  diabetes type, anemia specification, sepsis clarification (SIRS groups with
  minGroups: 2), CKD stage (text), CKD (SNOMED, code 709044004,
  `=`/`descendent-of`), CKD (ICD-10, N18.9 `=` → resolves on N18.1–N18.6 `=`),
  "Hello, fellow agent" (prompt demo).
- The code agent uses model `corti-s1-instant` (set via
  `managementClient.agentic.agents.update()`). The prompt agent uses the
  same model. If the update fails, agents fall back to the tenant default
  model.
- Agent response JSON extraction is robust: handles markdown-fenced JSON,
  JSON embedded in prose, and raw JSON. Array-form criterion IDs are coerced
  to colon-delimited strings.
- Run `npx vitest run client/applets/real-time-nudge` for focused regression tests.

## Future opportunities

- **Top priority: coding MCP integration** for verified SNOMED hierarchy relationships.

- **Separate ICD-10 agent.** If reasoning quality degrades when one agent
  handles both SNOMED and ICD-10, a dedicated ICD-10 agent with its own
  system prompt may be needed.
- **Agent reasoning display.** The agent returns criterion-level explanations — surfacing this in the popover or a details panel would
  help clinicians understand why a nudge fired.
- **Server-side rule persistence.** Rules currently persist to localStorage
  per clientId:tenant. A server-backed store would enable sharing rules across
  sessions and clinicians.
- **Voice command integration.** "Dismiss nudge" or "resolve nudge" as voice
  commands, leveraging the existing dictation command framework.

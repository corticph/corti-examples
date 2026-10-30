/**
 * Details card for the Real-time nudge applet — explains the cadence model,
 * grammar model, rule structure, and SNOMED-CT + agent evaluation.
 */

export function RealTimeNudgeDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Cadence model
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            Evaluation fires on documentation cadence, not a timer — after sentence completion
            (period + space), line breaks, paragraph breaks, or edits.
          </li>
          <li>
            A 3-second debounce resets on each event, so a rapid burst of typing waits for the burst
            to settle before evaluating.
          </li>
          <li>
            Only final text is evaluated — interim dictation transcripts are ignored to avoid noise
            from partial results.
          </li>
          <li>
            While the prediction + agent pipeline is running, new cadence events are suppressed —
            the latest text is queued and a single re-evaluation starts when the pipeline completes.
            This eliminates wasted API calls during continuous dictation.
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Grammar model
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            <code>[optional]</code> — the bracketed word is optional in a phrase.{" "}
            <code>[congestive] heart failure</code> matches both "congestive heart failure" and
            "heart failure."
          </li>
          <li>
            <code>(A|B|C)</code> — alternation: one of the pipe-separated options must be present.{" "}
            <code>(systolic|diastolic)</code> matches if either term appears.
          </li>
          <li>
            <code>{"{textMatch.conditions}"}</code> — self-reference: expands to the rule's own
            trigger <code>conditions</code> values, so resolve criteria don't repeat the condition
            terms.
          </li>
          <li>
            Space-separated groups in one <code>contains</code> value are AND-ed — all must match.
          </li>
          <li>
            <code>groups</code> + <code>minGroups</code> — named criterion groups with a count
            threshold, for rules like "2+ SIRS criteria present."
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Rule structure
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            <strong>Trigger criteria:</strong> when met, the nudge fires. Text conditions use{" "}
            <code>conditions</code> with a <code>mode</code> of <code>any</code> (OR) or{" "}
            <code>all</code> (AND), plus <code>none</code> (NOT). SNOMED conditions use a code,
            operator (<code>=</code>, <code>is-a</code>, <code>descendent-of</code>), and
            present/absent requirement.
          </li>
          <li>
            <strong>Resolve criteria:</strong> when met, the nudge auto-resolves with a checkmark
            and fades.
          </li>
          <li>
            <strong>Dismiss:</strong> user can dismiss a nudge; it won't re-fire for the same
            trigger in the same session.
          </li>
          <li>
            <strong>Rule editor:</strong> built-in rules can be viewed in read-only mode; custom
            rules are fully editable with a structured query builder (collapsible trigger/resolve
            sections, add/remove condition rows, mode selectors).
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Code prediction + agent evaluation
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            Text is sent to <code>client.codes.predict()</code> with <code>snomedctint</code> and/or{" "}
            <code>icd10cm-outpatient</code> depending on which code systems are enabled. Prediction
            is unfiltered so conditions that check for absence retain coverage of the referenced
            concepts.
          </li>
          <li>
            Predicted codes and the clinical text are sent to a Corti Agentic Framework agent, which
            evaluates both SNOMED and ICD-10 rules with hierarchy-aware reasoning (<code>is-a</code>{" "}
            / <code>descendent-of</code>) and contextual awareness (negation, family history,
            ruled-out conditions).
          </li>
          <li>
            Text rules evaluate instantly via the grammar engine (no API call). Code and prompt
            decisions are combined for the same note and rule configuration. Incomplete results
            remain unknown; retained nudges are marked as out of date.
          </li>
          <li>
            Successful results for unchanged inputs are cached in memory for up to five minutes.
            Each service runs one request at a time and keeps the latest pending input. Agent result
            caching can be disabled; identical pending requests still share work.
          </li>
          <li>
            SNOMED code details (predicted code, supporting evidence, alternatives) are available
            via an info button on nudge cards. SNOMED browser and ICD-10 index links are in the rule
            editor toolbar.
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Seed rules (10 built-in)
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>CHF specificity (text) — heart failure without type or acuity</li>
          <li>CHF specificity (SNOMED) — SNOMED code 84114007 without a subtype</li>
          <li>CHF specificity (ICD-10) — ICD-10 code I50.9 without a specific subtype</li>
          <li>Diabetes type — diabetes without type 1 or type 2</li>
          <li>Anemia specification — anemia without etiology</li>
          <li>Sepsis clarification — infection with 2+ SIRS criteria, no sepsis diagnosis</li>
          <li>CKD stage (text) — chronic kidney disease without a stage</li>
          <li>CKD (SNOMED) — SNOMED code 709044004 without a subtype</li>
          <li>CKD (ICD-10) — ICD-10 code N18.9 without a specific stage</li>
          <li>Hello, fellow agent — prompt-only demo rule</li>
        </ul>
      </div>
    </div>
  );
}

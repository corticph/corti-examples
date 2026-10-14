/**
 * Details card for the Command Genie applet — explains the agent flow,
 * available action kinds, nudge criteria types, and safety boundaries.
 */

export function CommandGenieDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How it works
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            The user selects a mode (command or nudge) and enters two text inputs: trigger
            phrases/description and the desired action/message.
          </li>
          <li>
            A JSON message is sent to a Corti Agentic Framework agent named "Command Genie." The
            agent interprets the inputs and returns structured JSON for a{" "}
            <code>ManagedCommand</code> or a <code>NudgeRule</code>.
          </li>
          <li>
            The response is validated (ID format, phrases, action structure, criteria types) before
            being saved to the shared store — <code>commandStore</code> for commands,{" "}
            <code>nudgeRuleStore</code> for nudges.
          </li>
          <li>
            Saved items appear immediately in the live dictation surface below — dictate the phrase
            to fire the command, or type a note to trigger the nudge evaluation pipeline.
          </li>
          <li>
            The success message reads: "Your wish is my command! Command 'title' that does 'x' is
            ready for use."
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Command action kinds
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            <code>insert_text</code> — insert predefined text at the cursor
          </li>
          <li>
            <code>script</code> — run custom JavaScript with <code>editor</code>,{" "}
            <code>command</code>, and <code>variables</code> in scope
          </li>
          <li>
            <code>delete_last</code> — delete the most recently dictated segment
          </li>
          <li>
            <code>new_paragraph</code> — insert a line break
          </li>
          <li>
            <code>capitalize_last</code> — capitalize the last dictated segment
          </li>
          <li>
            <code>keypress</code> — replay a captured keystroke sequence (Ctrl+B → bold, etc.)
          </li>
          <li>
            <code>noop</code> — no editor action (for testing/navigation)
          </li>
          <li>
            <code>insert_template</code>, <code>select_enum</code>, <code>select_wildcard</code>,{" "}
            <code>format</code> — use a variable from the command phrase
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Nudge criteria types
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            <strong>Text matching</strong> (<code>textMatch</code>) — instant, no API cost. Supports{" "}
            <code>conditions</code> (AND/OR via <code>mode</code>), <code>none</code> (exclusion),
            and grammar syntax: <code>[optional]</code>, <code>(A|B|C)</code> alternation,{" "}
            <code>{"{textMatch.conditions}"}</code> self-reference, <code>groups</code> +{" "}
            <code>minGroups</code> for count-based criteria.
          </li>
          <li>
            <strong>SNOMED-CT</strong> (<code>snomed</code>) — agent-assisted, requires code
            prediction. Uses <code>code</code>, <code>op</code> (<code>=</code>, <code>is-a</code>,{" "}
            <code>descendent-of</code>), and <code>condition</code> (<code>present</code>/
            <code>absent</code>).
          </li>
          <li>
            <strong>ICD-10-CM</strong> (<code>icd10</code>) — same structure as SNOMED, uses
            ICD-10-CM codes.
          </li>
          <li>
            <strong>Prompt</strong> (<code>prompt</code>) — uses a Corti agent to evaluate a
            free-text instruction against the note (max 500 chars). No predict call needed.
          </li>
          <li>
            Cross-criteria <code>mode</code>: <code>all</code> (AND, default) or <code>any</code>{" "}
            (OR) across the present criteria types.
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Safety
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            The agent's system prompt is <strong>fixed</strong> — not user-editable. This is a
            deliberate safety boundary.
          </li>
          <li>
            User inputs (<code>input1</code>, <code>input2</code>) are sent as data, not
            instructions. The system prompt instructs the agent to treat them as configuration
            descriptions.
          </li>
          <li>
            The agent has no <code>experts</code> (no MCP servers, no tools) — it can only generate
            JSON text.
          </li>
          <li>
            The <code>script</code> action kind runs in a sandboxed <code>new Function()</code>{" "}
            scope (same as the existing command dispatch system). The agent generates the script,
            not the user.
          </li>
          <li>
            Generated items persist to the shared stores and appear in the{" "}
            <strong>Dictation commands</strong> and <strong>Real-time nudge</strong> applets for the
            same API client.
          </li>
        </ul>
      </div>
    </div>
  );
}

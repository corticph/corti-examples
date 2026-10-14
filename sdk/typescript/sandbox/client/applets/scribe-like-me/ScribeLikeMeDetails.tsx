import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type AgentPromptStatus,
  DEFAULT_REVIEWER_PROMPT,
  DEFAULT_TAILOR_PROMPT,
  resetReviewerPrompt,
  resetTailorPrompt,
  STYLE_REVIEWER_META,
  saveReviewerPrompt,
  saveTailorPrompt,
  TEMPLATE_TAILOR_META,
  useScribeAgentPrompts,
} from "./agent";

function AgentPromptEditor({
  name,
  description,
  prompt,
  defaultPrompt,
  status,
  onSave,
  onReset,
}: {
  name: string;
  description: string;
  prompt: string;
  defaultPrompt: string;
  status: AgentPromptStatus;
  onSave: (prompt: string) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState(prompt);

  useEffect(() => {
    setDraft(prompt);
  }, [prompt]);

  const dirty = draft !== prompt;

  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-sm font-semibold text-foreground">{name}</p>
      <p className="mb-2 text-xs text-muted-foreground">{description}</p>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          System prompt
        </p>
        <span className="text-[10px] text-muted-foreground">
          {status === "preparing" ? "Updating agent…" : dirty ? "Unsaved changes" : ""}
        </span>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={10}
        spellCheck={false}
        className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground outline-none focus:border-corti-lime"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => onSave(draft)} disabled={!dirty || status === "preparing"}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset} disabled={status === "preparing"}>
          Reset to default
        </Button>
      </div>
      {draft !== defaultPrompt && (
        <p className="mt-1 text-[11px] text-muted-foreground">Differs from the built-in default.</p>
      )}
    </div>
  );
}

/** Details panel for the "scribe like me" applet: pipeline description plus
 * editable prompts for both agents (same pattern as second-pass-agent /
 * on-demand-agent). Saving pushes the new prompt to the live Corti agent via
 * `client.agents.update`; if that agent hasn't been created in this tenant
 * yet, the next run creates it with the current prompt directly. */
export function ScribeLikeMeDetails() {
  const { reviewerPrompt, tailorPrompt, status, error } = useScribeAgentPrompts();

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pipeline agents
        </p>
        <ol className="ml-4 mt-1 list-decimal text-muted-foreground">
          <li>
            <strong>Scribe Style Reviewer</strong> — reads a clinician's historical notes and writes
            a prose style summary (structure, tone, abbreviations, what's emphasized or omitted).
          </li>
          <li>
            <strong>Scribe Template Tailor</strong> — takes that summary plus a shortlist of Corti
            Standard templates (each with its default per-section prompts) and picks the best-fit
            template, returning one <code>contentPrompt</code>/<code>writingStylePrompt</code>{" "}
            override per section, grounded in the summary.
          </li>
        </ol>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Agent prompts
        </p>
        <AgentPromptEditor
          name={STYLE_REVIEWER_META.name}
          description={STYLE_REVIEWER_META.description}
          prompt={reviewerPrompt}
          defaultPrompt={DEFAULT_REVIEWER_PROMPT}
          status={status}
          onSave={(p) => void saveReviewerPrompt(p)}
          onReset={() => void resetReviewerPrompt()}
        />
        <AgentPromptEditor
          name={TEMPLATE_TAILOR_META.name}
          description={TEMPLATE_TAILOR_META.description}
          prompt={tailorPrompt}
          defaultPrompt={DEFAULT_TAILOR_PROMPT}
          status={status}
          onSave={(p) => void saveTailorPrompt(p)}
          onReset={() => void resetTailorPrompt()}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-[11px] text-muted-foreground">
          Saved per API client. If either agent already exists in this tenant from before this
          prompt changed, saving (or resetting) here is what pushes the update live — a new tenant
          creates the agent with today's prompt directly.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How tailoring is applied
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            Both agents are generic and stateless (no <code>contextId</code>) — persona-specific
            data is passed in the message, not baked into the agent, so one Reviewer and one Tailor
            serve every persona.
          </li>
          <li>
            Overrides are applied at generation time via{" "}
            <code>
              documents.generate({"{"} templateRef: {"{"} templateId, overrides {"}"} {"}"}
            </code>{" "}
            — Corti's "Path 2" pattern for per-user customization without maintaining a template per
            user. The base Corti Standard template is never mutated.
          </li>
          <li>
            "Out-of-the-box" generation in step 3 calls the same endpoint with no overrides, so the
            two columns are a true before/after on identical input.
          </li>
          <li>
            Personas, historical notes, and saved style profiles persist to{" "}
            <code>localStorage</code>, namespaced per API client — same mechanism as this sandbox's
            other config-backed applets (e.g. dictation commands).
          </li>
        </ul>
      </div>
      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        Uses the Corti <strong>Agentic Framework</strong> and <strong>Guided Documents</strong>.
        Live audio capture uses the same <code>interactions.create</code> → <code>/streams</code>{" "}
        flow as the conversational-transcript applet.
      </p>
    </div>
  );
}

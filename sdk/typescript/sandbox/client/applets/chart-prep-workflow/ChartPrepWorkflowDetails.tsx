/** Static details panel for the chart prep multi-agent workflow applet. */
export function ChartPrepWorkflowDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Workflow agents
        </p>
        <ol className="ml-4 mt-1 list-decimal text-muted-foreground">
          <li>
            <strong>Chart Fact Extractor</strong> — extracts structured clinical facts (chief
            complaint, symptoms, vitals, medications, etc.) from a raw transcript or note.
          </li>
          <li>
            <strong>Chart Note Drafter</strong> — synthesizes the extracted facts into a concise
            SOAP note (Subjective, Objective, Assessment, Plan).
          </li>
          <li>
            <strong>Chart Code Suggester</strong> — reviews the drafted SOAP note and recommends up
            to five ICD-10-CM codes with brief rationale.
          </li>
        </ol>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How it works
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            Three Corti agents are created on first use (via client.agents.create if absent) and
            cached for reuse.
          </li>
          <li>
            Stage 1 (fact extraction) output becomes Stage 2 (note drafting) input; Stage 2 output
            becomes Stage 3 (code suggestion) input — a linear pipeline.
          </li>
          <li>
            Each agent is isolated (no contextId) — the pipeline is stateless and can be re-run on
            different inputs without side effects.
          </li>
          <li>
            This is a simple example of task decomposition: each agent is responsible for exactly
            one transformation step.
          </li>
        </ul>
      </div>
      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        Uses the Corti <strong>Agentic Framework</strong>. See{" "}
        <a
          className="underline"
          href="https://docs.corti.ai/authentication/quickstart"
          target="_blank"
          rel="noopener noreferrer"
        >
          authentication docs
        </a>
        .
      </p>
    </div>
  );
}

/** Static details panel for the QA and compliance reviewer multi-agent workflow applet. */
export function QaReviewerWorkflowDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Workflow agents
        </p>
        <ol className="ml-4 mt-1 list-decimal text-muted-foreground">
          <li>
            <strong>QA Note Drafter</strong>: produces a structured SOAP note from the input, the
            raw material for the review.
          </li>
          <li>
            <strong>QA Note Reviewer</strong>: inspects the draft for missing elements,
            inconsistencies, risk areas, and compliance gaps.
          </li>
          <li>
            <strong>QA Note Reviser</strong>: takes both the draft and the review findings and
            proposes specific, actionable corrections alongside follow-up questions for the
            clinician.
          </li>
        </ol>
      </div>

      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        The reviewer only ever sees the draft, never the original input — a draft-review-revise loop
        keeps review honest by separating the critiquing agent from the one that wrote the draft.
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

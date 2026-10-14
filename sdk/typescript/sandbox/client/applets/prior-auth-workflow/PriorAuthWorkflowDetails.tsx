/** Static details panel for the prior authorization multi-agent workflow applet. */
export function PriorAuthWorkflowDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Workflow agents
        </p>
        <ol className="ml-4 mt-1 list-decimal text-muted-foreground">
          <li>
            <strong>PA Context Organizer</strong> — extracts and organizes clinical context
            (diagnosis, findings, prior treatments, urgency) from unstructured notes.
          </li>
          <li>
            <strong>PA Justification Writer</strong> — drafts a payer-facing medical necessity
            statement in 2–4 professional sentences using the organized context.
          </li>
          <li>
            <strong>PA Request Formatter</strong> — receives both the organized context and the
            justification and formats a complete, structured PA request ready for submission.
          </li>
        </ol>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How it works
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            Stage 1 extracts and organizes clinical context (diagnosis, findings, prior treatments,
            urgency) from unstructured notes.
          </li>
          <li>
            Stage 2 uses the organized context to draft a payer-facing medical necessity statement
            in 2–4 professional sentences.
          </li>
          <li>
            Stage 3 receives both the organized context and the justification, then formats a
            complete, structured PA request ready for submission.
          </li>
          <li>
            This decomposition mirrors real PA workflows: context gathering, clinical reasoning
            documentation, and output formatting are handled by separate, focused agents.
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

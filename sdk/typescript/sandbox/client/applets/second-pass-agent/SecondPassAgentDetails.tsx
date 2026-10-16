import { AgentLibraryEditor } from "./AgentLibraryEditor";
import { SECOND_PASS_AGENT } from "./agent";

export function SecondPassAgentDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How it works
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            A raw transcript from pre-recorded audio is a first draft — accurate but unstructured,
            with speaker labels, no formatting, and no clinical synthesis. The second-pass agent
            processes the finalized transcript text to produce a concise, clinically useful output.
          </li>
          <li>
            Two phases run in sequence: first the REST <code>/transcripts</code> endpoint
            transcribes the uploaded audio, then the agent receives the flattened transcript text
            and returns a cleaned-up version. The original transcript stays visible alongside the
            agent output, so neither the transcript nor the agent pass is lost if the other fails.
          </li>
          <li>
            The agent is created once (model <code>corti-s1-mini</code>, lifecycle{" "}
            <code>persistent</code>) and reused for every run. Pick which agent to apply from the
            dropdown in the live demo — each entry here defines its own name and system prompt.
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent</p>
        <p className="mt-1 text-foreground">{SECOND_PASS_AGENT.name}</p>
        <p className="text-xs text-muted-foreground">{SECOND_PASS_AGENT.description}</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Agent library
        </p>
        <AgentLibraryEditor />
      </div>
    </div>
  );
}

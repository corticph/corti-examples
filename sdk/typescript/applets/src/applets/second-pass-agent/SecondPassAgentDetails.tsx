import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  exportAgent,
  resetPrompt,
  SECOND_PASS_AGENT,
  savePrompt,
  useSecondPassAgentStore,
} from "./agent";

export function SecondPassAgentDetails() {
  const { prompt, status } = useSecondPassAgentStore();
  const [draft, setDraft] = useState(prompt);

  useEffect(() => {
    setDraft(prompt);
  }, [prompt]);

  const dirty = draft !== prompt;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent</p>
        <p className="mt-1 text-foreground">{SECOND_PASS_AGENT.name}</p>
        <p className="text-xs text-muted-foreground">{SECOND_PASS_AGENT.description}</p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            System prompt
          </p>
          <span className="text-xs text-muted-foreground">
            {status === "preparing" ? "Updating agent..." : dirty ? "Unsaved changes" : ""}
          </span>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          spellCheck={false}
          className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground outline-none focus:border-corti-lime"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => savePrompt(draft)}
            disabled={!dirty || status === "preparing"}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => resetPrompt()}>
            Reset to default
          </Button>
          <Button size="sm" variant="outline" onClick={exportAgent}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Saving updates the agent in place; the prompt is stored per API client.
        </p>
      </div>
    </div>
  );
}

/** Details card: edit/save/export the agent's system prompt + lifecycle info. */

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { COPY_EDIT_AGENT, exportAgent, resetPrompt, savePrompt, useCopyEditStore } from "./agent";

export function OnDemandAgentDetails() {
  const { prompt, status } = useCopyEditStore();
  const [draft, setDraft] = useState(prompt);

  // Re-sync the editor when the stored prompt changes (identity load / reset).
  useEffect(() => setDraft(prompt), [prompt]);

  const dirty = draft !== prompt;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent</p>
        <p className="mt-1 text-foreground">{COPY_EDIT_AGENT.name}</p>
        <p className="text-xs text-muted-foreground">{COPY_EDIT_AGENT.description}</p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            System prompt
          </p>
          <span className="text-xs text-muted-foreground">
            {status === "preparing" ? "Updating agent…" : dirty ? "Unsaved changes" : ""}
          </span>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={9}
          spellCheck={false}
          className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground outline-none focus:border-corti-lime"
        />
        <div className="mt-2 flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => savePrompt(draft)}
            disabled={!dirty || status === "preparing"}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => resetPrompt()}
            title="Restore the default prompt"
          >
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

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How it works
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            On first use the agent is created via <code>client.agents.create</code> if one named “
            {COPY_EDIT_AGENT.name}” doesn’t already exist; its id is cached per API client.
          </li>
          <li>
            A copy-edit sends the editor text via <code>client.agents.messageSend</code> (no
            contextId — each call is isolated) and replaces the editor with the returned text. When
            the agent makes no edits it returns the text unchanged, so your content is always
            preserved.
          </li>
          <li>
            Editing the prompt calls <code>client.agents.update</code> so the behavior changes
            without recreating the agent.
          </li>
        </ul>
      </div>

      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        Requires an auth token scoped for the Corti <strong>Agentic Framework</strong> for the API
        client credentials.{" "}
        <a
          className="underline"
          href="https://docs.corti.ai/authentication/quickstart"
          target="_blank"
          rel="noopener noreferrer"
        >
          See authentication details
        </a>
        .
      </p>
    </div>
  );
}

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { resetPrompt, savePrompt, useConversationStore, WAKE_COMMAND_AGENT } from "./agent";

function exportAgent(prompt: string) {
  const payload = { agent: { ...WAKE_COMMAND_AGENT, systemPrompt: prompt } };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "corti-wake-command-agent.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function WakeCommandAgentDetails() {
  const { prompt, status } = useConversationStore();
  const [draft, setDraft] = useState(prompt);

  useEffect(() => setDraft(prompt), [prompt]);

  const dirty = draft !== prompt;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How it works
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            Agent conversations are gated behind a wake phrase so the microphone isn't always
            streaming to the agent. Keep the mic live and speak a single-utterance wake command like
            "hey Corti summarize the plan" — STT results not preceded by the wake phrase are
            ignored.
          </li>
          <li>
            When the wake phrase is recognized, the spoken intent is extracted from the command
            variable and sent to a Corti Agentic Framework agent. Responses stream incrementally via
            SSE for minimal latency, appearing token-by-token in the chat panel. The agent uses
            model <code>corti-s1-mini</code> with lifecycle <code>persistent</code>. Threaded memory
            persists across turns until you reset the conversation.
          </li>
          <li>
            You can also type directly into the composer. An auto-send toggle controls whether
            wake-command intents go straight to the agent or land in the composer for review before
            sending.
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent</p>
        <p className="mt-1 text-foreground">{WAKE_COMMAND_AGENT.name}</p>
        <p className="text-xs text-muted-foreground">{WAKE_COMMAND_AGENT.description}</p>
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
          rows={9}
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
          <Button size="sm" variant="outline" onClick={() => exportAgent(prompt)}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>
    </div>
  );
}

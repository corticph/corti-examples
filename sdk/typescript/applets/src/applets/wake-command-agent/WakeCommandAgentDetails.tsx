import { Download, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  clearDebugLog,
  resetPrompt,
  savePrompt,
  useConversationStore,
  WAKE_COMMAND_AGENT,
} from "./agent";

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
  const { prompt, status, debugLog } = useConversationStore();
  const [draft, setDraft] = useState(prompt);

  useEffect(() => setDraft(prompt), [prompt]);

  const dirty = draft !== prompt;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              STT debug log
            </p>
            <p className="text-xs text-muted-foreground">
              Final transcript events and matched commands only. No interim results are shown here.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={clearDebugLog}>
            <Trash2 className="h-4 w-4" /> Clear
          </Button>
        </div>
        <ScrollArea className="h-56 rounded-md border border-border bg-background">
          <div className="flex flex-col gap-2 p-3">
            {debugLog.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No final transcript or command events captured yet.
              </p>
            ) : (
              debugLog.map((entry) => (
                <div key={entry.id} className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <span>{entry.type}</span>
                    <span>{new Date(entry.at).toLocaleTimeString()}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap font-mono text-xs text-foreground">
                    {entry.text || "(empty)"}
                  </p>
                  {entry.variables && Object.keys(entry.variables).length > 0 && (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      variables: {JSON.stringify(entry.variables)}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
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

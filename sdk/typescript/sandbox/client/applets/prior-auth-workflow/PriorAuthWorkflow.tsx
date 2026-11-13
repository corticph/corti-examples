/** Multi-agent prior authorization draft workflow: context → justification → formatted request. */

import { Loader2, Shield } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useSessionState } from "../_shared/sessionState";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { configurePriorAuth, runPriorAuth, usePriorAuthStore } from "./agent";

export function PriorAuthWorkflow() {
  const { authConfig, clientId, tenantName, sdkEnvironment } = useCortiAccessToken();
  const { status, stage, stage1Output, stage2Output, stage3Output, error } = usePriorAuthStore();
  const [input, setInput] = useSessionState("input", "");

  useEffect(() => {
    configurePriorAuth(authConfig, sdkEnvironment, clientId, tenantName);
  }, [authConfig, sdkEnvironment, clientId, tenantName]);

  const busy = status === "running";

  const stages = [
    { label: "Organize context", output: stage1Output, outputLabel: "Clinical context" },
    { label: "Write justification", output: stage2Output, outputLabel: "Justification" },
    { label: "Format request", output: stage3Output, outputLabel: "PA request" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Prior-authorization draft workflow
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A three-agent pipeline that drafts a prior authorization request from clinical notes.
          Stage 1 organizes the clinical context, Stage 2 writes a payer-facing medical necessity
          justification, and Stage 3 formats the final structured PA request.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Clinical input
        </p>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          readOnly={busy}
          placeholder="Paste clinical notes, a recent encounter summary, or a physician's dictation here…"
          className="mt-1 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {stages.map((s, i) => {
          const isComplete = stage > i + 1 || status === "done";
          const isActive = stage === i + 1 && busy;
          return (
            <div key={s.label} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <div
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  isComplete
                    ? "bg-green-500/15 text-green-700 dark:text-green-400"
                    : isActive
                      ? "bg-corti-lime/15 text-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isActive && <Loader2 className="h-3 w-3 animate-spin" />}
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      <Button
        size="sm"
        onClick={() => void runPriorAuth(input)}
        disabled={busy || !input.trim()}
        className="w-fit"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
        Draft PA request
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        {stages.map(
          (s) =>
            s.output && (
              <div key={s.label} className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {s.outputLabel}
                </p>
                <textarea
                  value={s.output}
                  readOnly
                  rows={10}
                  className="w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground outline-none"
                />
              </div>
            ),
        )}
      </div>

      {status === "done" && (
        <p className="text-xs text-muted-foreground">
          Prior authorization draft complete — ready to review and submit.
        </p>
      )}
    </div>
  );
}

import { CortiClient } from "@corti/sdk";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionState } from "../_shared/sessionState";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { type CodingCode, runCodeValidation, useCodeValidatorStore } from "./api";

function CodePill({ code }: { code: CodingCode }) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-sm font-semibold text-foreground">{code.code}</span>
        <span className="font-mono text-xs text-muted-foreground">{code.system}</span>
      </div>
      <p className="mt-0.5 text-sm text-foreground">{code.display}</p>
    </div>
  );
}

function Column({
  label,
  icon,
  color,
  children,
  count,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 ${color}`}>
        {icon}
        <p className="text-xs font-semibold">{label}</p>
        <span className="ml-auto font-mono text-xs">{count}</span>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

export function CodeValidator() {
  const { status, result, error } = useCodeValidatorStore();
  const { authConfig, sdkEnvironment } = useCortiAccessToken();
  const [text, setText] = useSessionState("text", "");
  const [proposed, setProposed] = useSessionState("proposed", "");
  const busy = status === "running";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Code validation checker</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter a clinical note alongside your proposed codes. The API's predictions are compared
          against your proposal: confirmed matches, codes you missed, and codes that aren't
          evidenced in the note.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Clinical note
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          readOnly={busy}
          placeholder="Paste the clinical note to validate against…"
          className="mt-1 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Proposed codes
        </p>
        <input
          type="text"
          value={proposed}
          onChange={(e) => setProposed(e.target.value)}
          readOnly={busy}
          placeholder="e.g. J18.9, Z87.891, I10"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <p className="mt-1 text-xs text-muted-foreground">Comma or newline separated</p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => {
            const client = new CortiClient({
              environment: sdkEnvironment,
              auth: authConfig,
            });
            void runCodeValidation(client, text, proposed);
          }}
          disabled={busy || !text.trim()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Validate codes
        </Button>
        {busy && <span className="text-xs text-muted-foreground">Running validation…</span>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Validation results
          </p>
          <div className="flex flex-col gap-3 lg:flex-row">
            <Column
              label="Confirmed"
              count={result.confirmed.length}
              color="border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400"
              icon={<CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
            >
              {result.confirmed.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  None of your proposed codes were confirmed
                </p>
              ) : (
                result.confirmed.map((c) => <CodePill key={`${c.system}-${c.code}`} code={c} />)
              )}
            </Column>

            <Column
              label="Missed by proposal"
              count={result.missed.length}
              color="border-yellow-500/30 bg-yellow-500/5 text-yellow-700 dark:text-yellow-400"
              icon={<AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            >
              {result.missed.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No additional codes suggested
                </p>
              ) : (
                result.missed.map((c) => <CodePill key={`${c.system}-${c.code}`} code={c} />)
              )}
            </Column>

            <Column
              label="Not evidenced"
              count={result.unsupported.length}
              color="border-destructive/30 bg-destructive/5 text-destructive"
              icon={<XCircle className="h-3.5 w-3.5 shrink-0" />}
            >
              {result.unsupported.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  All proposed codes appear in API results
                </p>
              ) : (
                result.unsupported.map((c) => (
                  <div key={c} className="rounded-md border border-border bg-card p-2.5">
                    <span className="font-mono text-sm font-semibold text-foreground">{c}</span>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Not found in API response
                    </p>
                  </div>
                ))
              )}
            </Column>
          </div>
        </div>
      )}
    </div>
  );
}

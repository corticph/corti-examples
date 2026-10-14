import { ArrowLeftRight, Loader2 } from "lucide-react";
import { CortiClient } from "@corti/sdk";
import { Button } from "@/components/ui/button";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useSessionState } from "../_shared/sessionState";
import { type CodingCode, runCrosswalk, useCrosswalkStore } from "./api";

function groupBySystem(codes: CodingCode[]): Map<string, CodingCode[]> {
  const m = new Map<string, CodingCode[]>();
  for (const c of codes) {
    const arr = m.get(c.system) ?? [];
    arr.push(c);
    m.set(c.system, arr);
  }
  return m;
}

export function CodeCrosswalk() {
  const { status, codes, error, systems } = useCrosswalkStore();
  const { authConfig, sdkEnvironment } = useCortiAccessToken();
  const [input, setInput] = useSessionState("input", "");
  const busy = status === "running";
  const grouped = groupBySystem(codes);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Code crosswalk
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a clinical note and get code predictions across multiple coding
          systems simultaneously. Configure the target systems in the details
          panel — each code includes <code>alternatives</code> for equivalent
          codes within the same system.
        </p>
      </div>

      {systems.length === 0 && (
        <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          No coding systems configured. Open the details panel to add systems.
        </p>
      )}

      <textarea
        rows={8}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste a clinical note or encounter summary here…"
        className="w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => {
            const client = new CortiClient({
              environment: sdkEnvironment,
              auth: authConfig,
            });
            void runCrosswalk(client, input);
          }}
          disabled={busy || !input.trim() || systems.length === 0}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowLeftRight className="h-4 w-4" />
          )}
          Map codes
        </Button>
        {busy && (
          <span className="text-xs text-muted-foreground">
            Mapping across systems…
          </span>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {grouped.size > 0 && (
        <div className="flex flex-col gap-6">
          {Array.from(grouped.entries()).map(([system, systemCodes]) => (
            <div key={system}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {system}
              </p>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Code</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-left">Alternatives</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemCodes.map((c: CodingCode) => (
                      <tr key={c.code} className="border-t border-border">
                        <td className="px-3 py-2 font-mono font-semibold text-foreground">
                          {c.code}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {c.display}
                        </td>
                        <td className="px-3 py-2">
                          {c.alternatives.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {c.alternatives.map((a) => (
                                <span
                                  key={a.code}
                                  title={a.display}
                                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
                                >
                                  {a.code}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

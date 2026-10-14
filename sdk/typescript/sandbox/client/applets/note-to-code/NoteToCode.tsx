import { Loader2, Tag } from "lucide-react";
import { CortiClient } from "@corti/sdk";
import { Button } from "@/components/ui/button";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useSessionState } from "../_shared/sessionState";
import { type CodingCode, runNoteToCode, useNoteToCodeStore } from "./api";

export function NoteToCode() {
  const { status, codes, candidates, error } = useNoteToCodeStore();
  const { authConfig, sdkEnvironment } = useCortiAccessToken();
  const [input, setInput] = useSessionState("input", "");
  const busy = status === "running";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Note-to-code</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a clinical note and get medical code predictions from the
          configured coding systems. Uses <code>client.codes.predict()</code>{" "}
          directly — no agent required.
        </p>
      </div>

      <textarea
        rows={8}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste a clinical note, encounter summary, or discharge record here…"
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
            void runNoteToCode(client, input);
          }}
          disabled={busy || !input.trim()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Tag className="h-4 w-4" />
          )}
          Suggest codes
        </Button>
        {busy && (
          <span className="text-xs text-muted-foreground">Analyzing note…</span>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {codes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Suggested codes ({codes.length})
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">System</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left">Alternatives</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c: CodingCode) => (
                  <tr
                    key={`${c.system}-${c.code}`}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {c.system}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-foreground">
                      {c.code}
                    </td>
                    <td className="px-3 py-2 text-foreground">{c.display}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {c.alternatives && c.alternatives.length > 0 ? (
                        c.alternatives.map((a, j) => (
                          <span key={a.code} className="font-mono text-xs">
                            {j > 0 && ", "}
                            {a.code}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {candidates.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Candidate codes ({candidates.length})
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">System</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c: CodingCode) => (
                  <tr
                    key={`${c.system}-${c.code}`}
                    className="border-t border-border opacity-60"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {c.system}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-foreground">
                      {c.code}
                    </td>
                    <td className="px-3 py-2 text-foreground">{c.display}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

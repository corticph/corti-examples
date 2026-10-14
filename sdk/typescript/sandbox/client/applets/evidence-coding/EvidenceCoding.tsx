import { CortiClient } from "@corti/sdk";
import { BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionState } from "../_shared/sessionState";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import {
  type CodeEvidence,
  type CodingCode,
  runEvidenceCoding,
  useEvidenceCodingStore,
} from "./api";

function HighlightedText({ text, evidences }: { text: string; evidences: CodeEvidence[] }) {
  if (evidences.length === 0) {
    return <>{text}</>;
  }

  const spans: { start: number; end: number }[] = evidences
    .filter((e) => e.start >= 0 && e.end > e.start && e.end <= text.length)
    .sort((a, b) => a.start - b.start);

  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const span of spans) {
    if (span.start > pos) {
      parts.push(text.slice(pos, span.start));
    }
    parts.push(
      <mark
        key={`${span.start}-${span.end}`}
        className="rounded bg-yellow-400/30 text-foreground not-italic"
      >
        {text.slice(span.start, span.end)}
      </mark>,
    );
    pos = span.end;
  }
  if (pos < text.length) {
    parts.push(text.slice(pos));
  }
  return <>{parts}</>;
}

export function EvidenceCoding() {
  const { status, codes, error } = useEvidenceCodingStore();
  const { authConfig, sdkEnvironment } = useCortiAccessToken();
  const [input, setInput] = useSessionState("input", "");
  const [activeIndex, setActiveIndex] = useSessionState<number | null>("activeIndex", null);
  const busy = status === "running";

  const handleRun = () => {
    setActiveIndex(null);
    const client = new CortiClient({
      environment: sdkEnvironment,
      auth: authConfig,
    });
    void runEvidenceCoding(client, input);
  };

  const activeCode = activeIndex !== null ? codes[activeIndex] : null;
  const activeEvidences = activeCode ? activeCode.evidences : [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Evidence-based coding review</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a clinical note and get ICD-10-CM code predictions with evidence spans — character
          offsets into the source text that support each code. Click a code card to highlight the
          supporting text in the note.
        </p>
      </div>

      <textarea
        rows={8}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste a clinical note or encounter summary here…"
        className="w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleRun} disabled={busy || !input.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
          Review and code
        </Button>
        {busy && <span className="text-xs text-muted-foreground">Reviewing note…</span>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {codes.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Source note
              {activeCode && (
                <span className="ml-1 normal-case font-normal">— evidence highlighted</span>
              )}
            </p>
            <div className="rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground whitespace-pre-wrap">
              <HighlightedText text={input} evidences={activeEvidences} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Coded predictions ({codes.length})
            </p>
            {codes.map((c: CodingCode, i: number) => (
              <button
                type="button"
                key={`${c.system}-${c.code}`}
                onClick={() => setActiveIndex(activeIndex === i ? null : i)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  activeIndex === i
                    ? "border-foreground bg-muted/60"
                    : "border-border bg-card hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {c.code}
                    </span>
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                      {c.system}
                    </span>
                  </div>
                  {c.evidences.length > 0 && (
                    <span className="shrink-0 rounded bg-yellow-400/20 px-1.5 py-0.5 text-xs text-yellow-700 dark:text-yellow-400">
                      {c.evidences.length} evidence
                      {c.evidences.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-foreground">{c.display}</p>
                {c.evidences.length > 0 && (
                  <p className="mt-1 truncate text-xs text-muted-foreground italic">
                    "{c.evidences[0].text}"
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Applet — CONCEPT: batch/document coding with a review queue that learns
 * (`client.codes.predict`, one call per document, plus `filter`, re-run with
 * a filter built from what reviewers rejected).
 *
 * A single batch run only gets you a first, unfiltered read across every
 * document. This applet goes one step further: reviewers clear the queue,
 * every rejected code across the whole batch feeds a learned filter.exclude,
 * and re-running the batch with that learned filter should surface a
 * smaller, cleaner queue on the same documents.
 */

import type { Corti } from "@corti/sdk";
import { CortiClient } from "@corti/sdk";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { describeCodesError } from "../_shared/corti-codes";
import { EXAMPLES_ANALYTICS } from "../_shared/examplesAnalytics";
import { useSessionState } from "../_shared/sessionState";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";

interface BatchDoc {
  id: string;
  label: string;
  text: string;
}

interface ReviewRow {
  docId: string;
  docLabel: string;
  item: Corti.CodesGeneralReadResponse;
}

interface Round {
  accepted: ReviewRow[];
  queue: ReviewRow[];
  credits: number;
  excludeUsed: string[];
}

type Decision = "accepted" | "rejected";

interface AuditEntry {
  at: string;
  actor: string;
  event: string;
}

const SAMPLE_DOCS: BatchDoc[] = [
  {
    id: "doc-1",
    label: "Visit 2024-11-02",
    text: "Patient presents with uncontrolled type 2 diabetes. HbA1c 9.2%. Continues metformin.",
  },
  {
    id: "doc-2",
    label: "Visit 2024-11-14",
    text: "Follow-up for chronic low back pain. No radiculopathy. Short course of NSAIDs prescribed.",
  },
  {
    id: "doc-3",
    label: "Visit 2024-12-01",
    text: "Annual wellness visit. Reviewed chest X-ray, no acute cardiopulmonary process.",
  },
];

function rowKey(row: ReviewRow) {
  return `${row.docId}::${row.item.system}:${row.item.code}`;
}

function dedupeRows(rows: ReviewRow[]) {
  return Array.from(new Map(rows.map((r) => [rowKey(r), r])).values());
}

export function MedicalCodingBatch() {
  const { authConfig, sdkEnvironment } = useCortiAccessToken();
  const [docs, setDocs] = useSessionState<BatchDoc[]>("docs", SAMPLE_DOCS);
  const [include, setInclude] = useSessionState("include", "");
  const [exclude, setExclude] = useSessionState("exclude", "");
  const [system] = useState<Corti.CommonCodingSystemEnum[]>(["icd10cm-outpatient", "cpt"]);
  const [rounds, setRounds] = useSessionState<Round[]>("rounds", []);
  const [decisions, setDecisions] = useSessionState<Record<string, Decision>>("decisions", {});
  const [auditLog, setAuditLog] = useSessionState<AuditEntry[]>("auditLog", []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useSessionState<string | null>("error", null);

  const addDoc = () => {
    setDocs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: `Document ${prev.length + 1}`,
        text: "",
      },
    ]);
  };

  const updateDoc = (id: string, patch: Partial<BatchDoc>) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const removeDoc = (id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const learnedExclude = () => {
    const rejectedCodes = new Set<string>();
    for (const round of rounds) {
      for (const row of round.queue) {
        if (decisions[rowKey(row)] === "rejected") {
          rejectedCodes.add(row.item.code);
        }
      }
    }
    return Array.from(rejectedCodes);
  };

  const runBatch = async () => {
    const active = docs.filter((d) => d.text.trim());
    if (active.length === 0) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const client = new CortiClient({
        environment: sdkEnvironment,
        auth: authConfig,
        analytics: EXAMPLES_ANALYTICS,
      });
      const manualInclude = include.trim() ? include.split(",").map((s) => s.trim()) : [];
      const manualExclude = exclude.trim() ? exclude.split(",").map((s) => s.trim()) : [];
      const excludeUsed = Array.from(new Set([...manualExclude, ...learnedExclude()]));
      const filter: Corti.CodesFilter | undefined =
        manualInclude.length || excludeUsed.length
          ? {
              include: manualInclude.length
                ? [{ property: "code", op: "is-a", value: manualInclude }]
                : undefined,
              exclude: excludeUsed.length
                ? [{ property: "code", op: "is-a", value: excludeUsed }]
                : undefined,
            }
          : undefined;

      const nextAccepted: ReviewRow[] = [];
      const nextQueue: ReviewRow[] = [];
      let totalCredits = 0;

      for (const doc of active) {
        const response = await client.codes.predict({
          system,
          context: [{ type: "text", text: doc.text }],
          filter,
        });
        totalCredits += response.usageInfo.creditsConsumed;
        response.codes.forEach((item) => {
          nextAccepted.push({ docId: doc.id, docLabel: doc.label, item });
        });
        response.candidates.forEach((item) => {
          nextQueue.push({ docId: doc.id, docLabel: doc.label, item });
        });
      }

      setRounds((prev) => [
        ...prev,
        {
          accepted: nextAccepted,
          queue: nextQueue,
          credits: totalCredits,
          excludeUsed,
        },
      ]);
      setAuditLog((prev) => [
        ...prev,
        {
          at: new Date().toISOString(),
          actor: "system",
          event:
            rounds.length === 0
              ? `ran initial batch across ${active.length} document(s)`
              : `re-ran batch with ${excludeUsed.length} learned/manual excluded code(s)`,
        },
      ]);
    } catch (e) {
      setError(describeCodesError(e));
    } finally {
      setLoading(false);
    }
  };

  const decide = (row: ReviewRow, decision: Decision) => {
    const key = rowKey(row);
    setDecisions((prev) => ({ ...prev, [key]: decision }));
    setAuditLog((prev) => [
      ...prev,
      {
        at: new Date().toISOString(),
        actor: "reviewer",
        event: `${decision} ${row.item.code} on ${row.docLabel} (${row.item.display})`,
      },
    ]);
  };

  const latestRound = rounds[rounds.length - 1];
  const allQueueRows = dedupeRows(rounds.flatMap((r) => r.queue));
  const lockedSet = dedupeRows([
    ...rounds.flatMap((r) => r.accepted),
    ...allQueueRows.filter((row) => decisions[rowKey(row)] === "accepted"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Batch coding with a review queue that learns
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Run the batch, clear the queue, then re-run with a filter built from every code reviewers
          rejected across the whole batch.
        </p>
      </div>

      <div className="space-y-3">
        {docs.map((doc) => (
          <div key={doc.id} className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center gap-2">
              <Input
                value={doc.label}
                onChange={(e) => updateDoc(doc.id, { label: e.target.value })}
                className="h-8 max-w-xs text-sm"
              />
              <Button size="sm" variant="ghost" onClick={() => removeDoc(doc.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              rows={2}
              value={doc.text}
              onChange={(e) => updateDoc(doc.id, { text: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={addDoc}>
          <Plus className="h-3.5 w-3.5" /> Add document
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor="filter-include"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          filter.include
          <Input
            id="filter-include"
            value={include}
            onChange={(e) => setInclude(e.target.value)}
            placeholder="E11, comma separated"
            className="h-8 w-48 font-mono text-xs"
          />
        </label>
        <label
          htmlFor="filter-exclude"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          filter.exclude (manual)
          <Input
            id="filter-exclude"
            value={exclude}
            onChange={(e) => setExclude(e.target.value)}
            placeholder="optional"
            className="h-8 w-48 font-mono text-xs"
          />
        </label>
      </div>

      <div>
        <Button onClick={runBatch} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : rounds.length > 0 ? (
            <RefreshCw className="h-4 w-4" />
          ) : null}
          {rounds.length === 0
            ? "Run batch"
            : `Re-run with learned filter (${learnedExclude().length} rejected code(s) learned)`}
        </Button>
      </div>

      {error && <p className="text-sm text-variant-error-foreground">{error}</p>}

      {latestRound && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Round {rounds.length}: auto-applied ({latestRound.accepted.length})
            </h3>
            <div className="space-y-2">
              {latestRound.accepted.map((row) => (
                <div key={rowKey(row)} className="rounded-md border border-border p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-foreground">{row.item.code}</span>
                    <Badge variant="outline">{row.docLabel}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{row.item.display}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Round {rounds.length}: review queue ({latestRound.queue.length})
            </h3>
            <div className="space-y-2">
              {latestRound.queue.map((row) => {
                const key = rowKey(row);
                const decision = decisions[key];
                return (
                  <div key={key} className="rounded-md border border-border p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-foreground">
                        {row.item.code}
                      </span>
                      <Badge variant="outline">{row.docLabel}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{row.item.display}</p>
                    {decision ? (
                      <Badge
                        variant={decision === "accepted" ? "default" : "destructive"}
                        className="mt-1"
                      >
                        {decision}
                      </Badge>
                    ) : (
                      <div className="mt-1 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => decide(row, "accepted")}>
                          Accept
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => decide(row, "rejected")}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {latestRound.queue.length === 0 && (
                <p className="text-sm text-muted-foreground">Empty queue for this round.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {lockedSet.length > 0 && (
        <div className="rounded-md border border-corti-lime/50 bg-corti-lime/5 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Locked code set across all rounds ({lockedSet.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {lockedSet.map((row) => (
              <Badge key={rowKey(row)} variant="secondary">
                {row.item.code}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {auditLog.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Audit log
          </h3>
          <ul className="space-y-1 font-mono text-xs text-muted-foreground">
            {auditLog.map((entry) => (
              <li key={entry.at}>
                [{entry.at}] {entry.actor}: {entry.event}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rounds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Total credits consumed across all rounds: {rounds.reduce((sum, r) => sum + r.credits, 0)}
        </p>
      )}
    </div>
  );
}

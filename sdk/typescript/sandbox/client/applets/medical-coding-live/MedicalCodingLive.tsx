/**
 * Applet — CONCEPT: coding a live encounter note, then refining it with a
 * reviewer feedback loop (`client.codes.predict`, called twice).
 *
 * A single predict() call only gets you a first pass. This applet takes it
 * one step further: a reviewer accepts or rejects each candidate, rejected
 * codes seed a filter.exclude for a second, refined predict() call, and the
 * accepted codes from both passes converge into one locked, exportable code
 * set with an append-only audit trail of every decision.
 */

import type { Corti } from "@corti/sdk";
import { CortiClient } from "@corti/sdk";
import { Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { cn } from "../../lib/utils";
import { CODING_SYSTEMS, describeCodesError } from "../_shared/corti-codes";
import { useSessionState } from "../_shared/sessionState";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";

const SAMPLE_NOTE = `Patient presents for follow-up of uncontrolled type 2 diabetes mellitus. HbA1c 9.2%. Continues metformin 1000mg twice daily. Discussed adding basal insulin at next visit. Also reports intermittent low back pain, no radiculopathy; started on a short course of NSAIDs. Reviewed a chest X-ray showing no acute cardiopulmonary process.`;

type Decision = "accepted" | "rejected";

interface AuditEntry {
  at: string;
  actor: string;
  event: string;
}

function candidateKey(item: Corti.CodesGeneralReadResponse) {
  return `${item.system}:${item.code}`;
}

function dedupeByKey(items: Corti.CodesGeneralReadResponse[]) {
  const seen = new Map<string, Corti.CodesGeneralReadResponse>();
  items.forEach((item) => {
    seen.set(candidateKey(item), item);
  });
  return Array.from(seen.values());
}

function CodeCard({
  item,
  decision,
  onDecide,
}: {
  item: Corti.CodesGeneralReadResponse;
  decision?: Decision;
  onDecide?: (decision: Decision) => void;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-foreground">{item.code}</span>
        <Badge variant="outline">{item.system}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{item.display}</p>
      {item.evidences && item.evidences.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
          {item.evidences.map((ev) => (
            <li key={`${ev.contextIndex}-${ev.start}`}>
              context[{ev.contextIndex}] chars {ev.start}-{ev.end}:{" "}
              <span className="italic">"{ev.text}"</span>
            </li>
          ))}
        </ul>
      )}
      {onDecide &&
        (decision ? (
          <div className="mt-2 border-t border-border pt-2">
            <Badge variant={decision === "accepted" ? "default" : "destructive"}>{decision}</Badge>
          </div>
        ) : (
          <div className="mt-2 flex gap-2 border-t border-border pt-2">
            <Button size="sm" variant="outline" onClick={() => onDecide("accepted")}>
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDecide("rejected")}>
              Reject
            </Button>
          </div>
        ))}
    </div>
  );
}

export function MedicalCodingLive() {
  const { authConfig, sdkEnvironment } = useCortiAccessToken();
  const [note, setNote] = useSessionState("note", SAMPLE_NOTE);
  const [systems, setSystems] = useSessionState<Set<Corti.CommonCodingSystemEnum>>(
    "systems",
    new Set(["icd10cm-outpatient", "cpt"]),
  );
  const [result, setResult] = useSessionState<Corti.CodesGeneralResponse | null>("result", null);
  const [refined, setRefined] = useSessionState<Corti.CodesGeneralResponse | null>("refined", null);
  const [decisions, setDecisions] = useSessionState<Record<string, Decision>>("decisions", {});
  const [auditLog, setAuditLog] = useSessionState<AuditEntry[]>("auditLog", []);
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [error, setError] = useSessionState<string | null>("error", null);

  const toggleSystem = (system: Corti.CommonCodingSystemEnum) => {
    setSystems((prev) => {
      const next = new Set(prev);
      if (next.has(system)) {
        next.delete(system);
      } else {
        next.add(system);
      }
      return next;
    });
  };

  const runPredict = async () => {
    if (!note.trim() || systems.size === 0) {
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setRefined(null);
    setDecisions({});
    setAuditLog([]);
    try {
      const client = new CortiClient({
        environment: sdkEnvironment,
        auth: authConfig,
      });
      const response = await client.codes.predict({
        system: Array.from(systems),
        context: [{ type: "text", text: note }],
      });
      setResult(response);
    } catch (e) {
      setError(describeCodesError(e));
    } finally {
      setLoading(false);
    }
  };

  const decide = (item: Corti.CodesGeneralReadResponse, decision: Decision) => {
    const key = candidateKey(item);
    setDecisions((prev) => ({ ...prev, [key]: decision }));
    setAuditLog((prev) => [
      ...prev,
      {
        at: new Date().toISOString(),
        actor: "reviewer",
        event: `${decision} ${item.code} (${item.display})`,
      },
    ]);
  };

  const runRefine = async () => {
    if (!result) {
      return;
    }
    setRefining(true);
    setError(null);
    try {
      const client = new CortiClient({
        environment: sdkEnvironment,
        auth: authConfig,
      });
      const rejectedCodes = result.candidates
        .filter((c) => decisions[candidateKey(c)] === "rejected")
        .map((c) => c.code);
      const response = await client.codes.predict({
        system: Array.from(systems),
        context: [{ type: "text", text: note }],
        filter: rejectedCodes.length
          ? {
              exclude: [{ property: "code", op: "is-a", value: rejectedCodes }],
            }
          : undefined,
      });
      setRefined(response);
      setAuditLog((prev) => [
        ...prev,
        {
          at: new Date().toISOString(),
          actor: "system",
          event: `refined predict, excluded ${rejectedCodes.length} rejected code(s)`,
        },
      ]);
    } catch (e) {
      setError(describeCodesError(e));
    } finally {
      setRefining(false);
    }
  };

  const reviewedCount = Object.keys(decisions).length;
  const uniqCodes = dedupeByKey([...(result?.codes ?? []), ...(refined?.codes ?? [])]);
  const uniqCandidates = dedupeByKey([
    ...(result?.candidates ?? []),
    ...(refined?.candidates ?? []),
  ]);
  const lockedSet = [
    ...uniqCodes,
    ...uniqCandidates.filter((c) => decisions[candidateKey(c)] === "accepted"),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Live encounter to coded output, with reviewer refinement
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Predict codes from a finalized note, accept or reject each candidate, then refine with a
          second <code>client.codes.predict</code> call that excludes what the reviewer rejected.
        </p>
      </div>

      <Textarea
        rows={8}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="font-mono text-sm"
        placeholder="Paste a finalized encounter note..."
      />

      <div className="flex flex-wrap items-center gap-2">
        {CODING_SYSTEMS.map((system) => (
          <button
            key={system}
            type="button"
            onClick={() => toggleSystem(system)}
            className={cn(
              "rounded-full border px-3 py-1 font-mono text-xs transition-colors",
              systems.has(system)
                ? "border-corti-lime bg-corti-lime/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {system}
          </button>
        ))}
      </div>

      <div>
        <Button onClick={runPredict} disabled={loading || !note.trim() || systems.size === 0}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Predict codes
        </Button>
      </div>

      {error && <p className="text-sm text-variant-error-foreground">{error}</p>}

      {result && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Codes ({result.codes.length})
              </h3>
              <div className="space-y-2">
                {result.codes.map((item) => (
                  <CodeCard key={candidateKey(item)} item={item} />
                ))}
                {result.codes.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No codes met the confidence threshold.
                  </p>
                )}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Candidates, review each one ({result.candidates.length})
              </h3>
              <div className="space-y-2">
                {result.candidates.map((item) => (
                  <CodeCard
                    key={candidateKey(item)}
                    item={item}
                    decision={decisions[candidateKey(item)]}
                    onDecide={(d) => decide(item, d)}
                  />
                ))}
                {result.candidates.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No lower-confidence candidates were returned.
                  </p>
                )}
              </div>
            </div>
          </div>

          {result.candidates.length > 0 && (
            <div>
              <Button
                variant="outline"
                onClick={runRefine}
                disabled={refining || reviewedCount === 0 || !!refined}
              >
                {refining && <Loader2 className="h-4 w-4 animate-spin" />}
                Refine with reviewer feedback ({reviewedCount}/{result.candidates.length} reviewed)
              </Button>
            </div>
          )}
        </div>
      )}

      {refined && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Refined pass: codes ({refined.codes.length})
            </h3>
            <div className="space-y-2">
              {refined.codes.map((item) => (
                <CodeCard key={candidateKey(item)} item={item} />
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Refined pass: new candidates ({refined.candidates.length})
            </h3>
            <div className="space-y-2">
              {refined.candidates.map((item) => (
                <CodeCard
                  key={candidateKey(item)}
                  item={item}
                  decision={decisions[candidateKey(item)]}
                  onDecide={(d) => decide(item, d)}
                />
              ))}
              {refined.candidates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No candidates remained after excluding rejected codes.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {lockedSet.length > 0 && (
        <div className="rounded-md border border-corti-lime/50 bg-corti-lime/5 p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Locked code set ({lockedSet.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {lockedSet.map((item) => (
              <Badge key={candidateKey(item)} variant="secondary">
                {item.code}
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

      {result && (
        <p className="text-xs text-muted-foreground">
          Credits consumed: {result.usageInfo.creditsConsumed}
          {refined && ` + ${refined.usageInfo.creditsConsumed} (refined pass)`}
        </p>
      )}
    </div>
  );
}

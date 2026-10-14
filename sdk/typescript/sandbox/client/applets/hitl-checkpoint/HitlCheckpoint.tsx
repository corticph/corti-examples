/**
 * Applet — CONCEPT: an application-level human approval checkpoint with a
 * revision loop, not just a single approve/reject gate.
 *
 * This is a narrative applet, not a live Agentic Framework demo: wiring a
 * real orchestrator needs external MCP servers this sandbox cannot assume
 * every reader has configured. Instead, this illustrates the
 * mechanic that matters: a proposal held in a pending state until a human
 * decides, a reviewer who can send it back with feedback instead of only
 * a binary accept/reject, an orchestrator that revises and resubmits, and
 * an append-only audit log covering every version of the chain.
 */

import { Check, MessageSquareWarning, RotateCcw, X } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { useSessionState } from "../_shared/sessionState";

type ProposalStatus = "pending" | "approved" | "rejected" | "revision_requested";

interface Proposal {
  taskId: string;
  version: number;
  proposedAt: string;
  proposedBy: string;
  action: string;
  payload: string;
  status: ProposalStatus;
  decidedBy?: string;
  decidedAt?: string;
  feedback?: string;
}

interface AuditEntry {
  at: string;
  actor: string;
  event: string;
}

let taskCounter = 0;

function makeProposal(version: number, payload: string): Proposal {
  if (version === 1) {
    taskCounter += 1;
  }
  return {
    taskId: `task-${taskCounter}`,
    version,
    proposedAt: new Date().toISOString(),
    proposedBy: "clinical-notes-expert",
    action: "facts.create",
    payload,
    status: "pending",
  };
}

const REVIEWER = "reviewer@clinic.example";

export function HitlCheckpoint() {
  const [chain, setChain] = useSessionState<Proposal[]>("chain", []);
  const [log, setLog] = useSessionState<AuditEntry[]>("log", []);
  const [feedbackDraft, setFeedbackDraft] = useSessionState("feedbackDraft", "");

  const current = chain[chain.length - 1] ?? null;

  const record = (event: string, actor: string) =>
    setLog((prev) => [...prev, { at: new Date().toISOString(), actor, event }]);

  const startNewChain = () => {
    if (current && (current.status === "pending" || current.status === "revision_requested")) {
      return;
    }
    const proposal = makeProposal(
      1,
      '{ "facts": [{ "text": "HbA1c 9.2%, uncontrolled", "group": "labs" }] }',
    );
    setChain([proposal]);
    setLog([]);
    setFeedbackDraft("");
    record(
      `proposed ${proposal.action} v${proposal.version} (${proposal.taskId})`,
      proposal.proposedBy,
    );
  };

  const approve = () => {
    if (!current) {
      return;
    }
    const decidedAt = new Date().toISOString();
    setChain((prev) =>
      prev.map((p, i) =>
        i === prev.length - 1 ? { ...p, status: "approved", decidedBy: REVIEWER, decidedAt } : p,
      ),
    );
    record(
      `approved v${current.version} (${current.taskId}), downstream mutation executed`,
      REVIEWER,
    );
  };

  const rejectOutright = () => {
    if (!current) {
      return;
    }
    const decidedAt = new Date().toISOString();
    setChain((prev) =>
      prev.map((p, i) =>
        i === prev.length - 1 ? { ...p, status: "rejected", decidedBy: REVIEWER, decidedAt } : p,
      ),
    );
    record(`rejected v${current.version} (${current.taskId}), not executed`, REVIEWER);
  };

  const requestRevision = () => {
    if (!current || !feedbackDraft.trim()) {
      return;
    }
    const decidedAt = new Date().toISOString();
    setChain((prev) =>
      prev.map((p, i) =>
        i === prev.length - 1
          ? {
              ...p,
              status: "revision_requested",
              decidedBy: REVIEWER,
              decidedAt,
              feedback: feedbackDraft,
            }
          : p,
      ),
    );
    record(
      `requested revision on v${current.version} (${current.taskId}): "${feedbackDraft}"`,
      REVIEWER,
    );
    setFeedbackDraft("");
  };

  const reviseProposal = () => {
    if (!current || current.status !== "revision_requested") {
      return;
    }
    const nextVersion = current.version + 1;
    const revised = {
      ...makeProposal(
        nextVersion,
        `${current.payload} // revised for v${nextVersion}: addressed "${current.feedback}"`,
      ),
      taskId: current.taskId,
    };
    setChain((prev) => [...prev, revised]);
    record(
      `orchestrator revised proposal to v${nextVersion} (${current.taskId}) based on feedback`,
      "clinical-notes-expert",
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Human approval checkpoint, with a revision loop
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          An orchestrator agent proposes an action instead of taking it. A reviewer can approve,
          reject outright, or send it back with feedback for a revised proposal, and every version
          is logged.
        </p>
      </div>

      <div>
        <Button
          onClick={startNewChain}
          disabled={current?.status === "pending" || current?.status === "revision_requested"}
        >
          Simulate: orchestrator proposes an action
        </Button>
      </div>

      {chain.map((proposal) => (
        <div key={proposal.version} className="rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm text-foreground">
              {proposal.taskId} · v{proposal.version}
            </span>
            <Badge
              variant={
                proposal.status === "approved"
                  ? "default"
                  : proposal.status === "rejected"
                    ? "destructive"
                    : proposal.status === "revision_requested"
                      ? "secondary"
                      : "outline"
              }
            >
              {proposal.status}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            action: <code>{proposal.action}</code>
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{proposal.payload}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            proposed by {proposal.proposedBy} at {proposal.proposedAt}
          </p>
          {proposal.feedback && (
            <p className="mt-1 text-xs text-variant-warning-text">
              feedback: "{proposal.feedback}"
            </p>
          )}
          {proposal.decidedAt && (
            <p className="mt-2 text-xs text-muted-foreground">
              decided by {proposal.decidedBy} at {proposal.decidedAt}
            </p>
          )}

          {proposal === current && current.status === "pending" && (
            <div className="mt-3 space-y-3 border-t border-border pt-3">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={approve}>
                  <Check className="h-3.5 w-3.5" /> Approve
                </Button>
                <Button size="sm" variant="outline" onClick={rejectOutright}>
                  <X className="h-3.5 w-3.5" /> Reject outright
                </Button>
              </div>
              <div className="flex flex-col items-start gap-2">
                <Textarea
                  rows={2}
                  value={feedbackDraft}
                  onChange={(e) => setFeedbackDraft(e.target.value)}
                  placeholder="Send back with feedback instead (e.g. missing lab context)..."
                  className="w-full text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={requestRevision}
                  disabled={!feedbackDraft.trim()}
                >
                  <MessageSquareWarning className="h-3.5 w-3.5" /> Request revision
                </Button>
              </div>
            </div>
          )}

          {proposal === current && current.status === "revision_requested" && (
            <div className="mt-3 border-t border-border pt-3">
              <Button size="sm" variant="outline" onClick={reviseProposal}>
                <RotateCcw className="h-3.5 w-3.5" /> Simulate: orchestrator revises based on
                feedback
              </Button>
            </div>
          )}
        </div>
      ))}

      {log.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Audit log
          </h3>
          <ul className="space-y-1 font-mono text-xs text-muted-foreground">
            {log.map((entry) => (
              <li key={entry.at}>
                [{entry.at}] {entry.actor}: {entry.event}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

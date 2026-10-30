/** Details card: why the approval gate is app-level, not an SDK feature. */
export function HitlCheckpointDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          No built-in approval state
        </p>
        <p className="mt-1 text-muted-foreground">
          There is no confirmed <code>client.agents.*</code> task status such as "awaiting approval"
          in the current SDK. The checkpoint in this applet is implemented entirely in application
          state: a <code>Proposal</code> object your app defines, not a Corti type.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Proposal shape (app-defined)
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {
            '{ taskId, version, proposedAt, proposedBy, action, payload, status: "pending" | "approved" | "rejected" | "revision_requested", decidedBy?, decidedAt?, feedback? }'
          }
        </p>
        <p className="mt-2 text-muted-foreground">
          A revision request keeps the same <code>taskId</code> and increments <code>version</code>,
          resetting <code>status</code> back to <code>pending</code> rather than starting a new,
          disconnected chain.
        </p>
      </div>

      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        Owning the gate yourself is a feature, not a limitation, for CFR Part 11 style requirements:
        the audit trail is data your app controls directly, not something opaque inside the agent
        framework.
      </p>
    </div>
  );
}

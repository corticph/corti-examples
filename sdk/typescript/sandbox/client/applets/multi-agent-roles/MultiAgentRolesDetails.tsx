/** Details card: per-agent connectors scoping under one orchestrator. */
export function MultiAgentRolesDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Where scoping happens
        </p>
        <p className="mt-1 text-muted-foreground">
          An agent's <code>connectors</code> list is everything it can reach. Give each role its own
          agent with its own <code>mcp</code> connectors, then attach those agents to the
          orchestrator as <code>agent</code> connectors.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Agent connector
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {'{ type: "agent", agentId }'}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          MCP connector
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {'{ type: "mcp", name, url, auth? }'}
        </p>
      </div>

      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        The common mistake is defining one <code>connectors</code> list and reusing it on every
        agent. Give each agent its own list, scoped to exactly what that role needs.
      </p>
    </div>
  );
}

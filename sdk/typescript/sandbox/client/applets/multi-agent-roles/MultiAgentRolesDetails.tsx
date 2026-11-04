/** Details card: agents.create with per-expert mcpServers scoping. */
export function MultiAgentRolesDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Where scoping happens
        </p>
        <p className="mt-1 text-muted-foreground">
          Each <code>experts</code> item can carry its own <code>mcpServers</code> array. There is
          no generic "tool" or "function" type in the SDK; every capability an expert can reach is
          whatever is in that expert's own <code>mcpServers</code> list.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Expert shape (inline "new")
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {'{ type: "new", name, description, systemPrompt?, mcpServers? }'}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          mcpServers item
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {"{ name, transportType, authorizationType, url, ... }"}
        </p>
      </div>

      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        The common mistake is defining one <code>mcpServers</code> array and reusing it on every
        expert. Give each expert its own list, scoped to exactly what that role needs.
      </p>
    </div>
  );
}

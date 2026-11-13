/** Details card: specialist agent connectors versus registry connectors. */
export function MultiAgentSpecialistsDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Two ways to add a specialist
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            <code>{'{ type: "agent", agentId }'}</code>: an agent you create for this deployment,
            with its own <code>connectors</code>
          </li>
          <li>
            <code>{'{ type: "registry", name }'}</code>: a pre-built connector from the Corti
            registry, attached without redefining it
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Finding registry connectors
        </p>
        <p className="mt-1 text-muted-foreground">
          <code>client.agentic.registry.connectors.list()</code> returns the pre-built connectors,
          each with an <code>id</code> (pass it as the registry connector's <code>name</code>), a{" "}
          <code>title</code>, a <code>description</code>, and an optional <code>configSchema</code>.
        </p>
      </div>

      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        Mixing agent and registry connectors in the same <code>connectors</code> list is expected:
        build what is specific to this deployment, reuse what already exists.
      </p>
    </div>
  );
}

/** Details card: inline "new" experts versus registry "reference" experts. */
export function MultiAgentSpecialistsDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Two ways to add an expert
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            <code>{'{ type: "new", name, description, systemPrompt?, mcpServers? }'}</code>: a
            bespoke expert defined inline, specific to this agent
          </li>
          <li>
            <code>{'{ type: "reference", id?, name?, systemPrompt?, config? }'}</code>: points at an
            existing or registry expert; <code>config</code> is deep-merged against that expert's{" "}
            <code>configSchema</code>
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Finding registry experts
        </p>
        <p className="mt-1 text-muted-foreground">
          <code>client.agents.getRegistryExperts()</code> returns pre-built experts your
          organization has published, each with a <code>name</code>, <code>description</code>, and
          optional <code>mcpServers</code> and <code>configSchema</code>. Reference one by{" "}
          <code>name</code> or <code>id</code> instead of redefining it.
        </p>
      </div>

      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        Mixing inline and reference experts in the same <code>experts</code> array is expected:
        build what is specific to this deployment, reuse what already exists.
      </p>
    </div>
  );
}

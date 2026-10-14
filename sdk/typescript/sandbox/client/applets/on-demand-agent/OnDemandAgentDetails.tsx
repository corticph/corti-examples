/** Details card: the cleanup prompt library + agent lifecycle info. */

import { COPY_EDIT_AGENT } from "./agent";
import { CleanupPromptLibrary } from "./CleanupPromptLibrary";

export function OnDemandAgentDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent</p>
        <p className="mt-1 text-foreground">{COPY_EDIT_AGENT.name}</p>
        <p className="text-xs text-muted-foreground">{COPY_EDIT_AGENT.description}</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Prompt library
        </p>
        <CleanupPromptLibrary />
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How it works
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            On first use the agent is created via <code>client.agents.create</code> if one named “
            {COPY_EDIT_AGENT.name}” doesn’t already exist; its id is cached per API client.
          </li>
          <li>
            A copy-edit sends the editor text via <code>client.agents.messageSend</code> (no
            contextId — each call is isolated) and replaces the editor with the returned text. When
            the agent makes no edits it returns the text unchanged, so your content is always
            preserved.
          </li>
          <li>
            There is <strong>one agent with a swapped prompt</strong>, not an agent per library
            entry: changing the active prompt calls <code>client.agents.update</code>. An agent per
            entry would litter the tenant with agents for every prompt anyone ever tried, and they
            would outlive the local library that named them.
          </li>
          <li>
            The prompt to install is chosen by dictation language unless you pin one. A prompt is
            only correct for the language it was written for — an English copy-editor will happily
            “correct” Danish text into English — so the language is part of a prompt’s identity
            here.
          </li>
        </ul>
      </div>

      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        Uses the Corti <strong>Agentic Framework</strong> with standard API client credentials. See
        authentication details{" "}
        <a
          className="underline"
          href="https://docs.corti.ai/authentication/quickstart"
          target="_blank"
          rel="noopener noreferrer"
        >
          here
        </a>
        .
      </p>
    </div>
  );
}

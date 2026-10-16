/**
 * Thin helpers over the Corti Agentic Framework v2 (`client.agentic.agents.*`),
 * following a get-or-create pattern: ensure an agent exists by name (create if
 * missing), then send it a message and read the text back. The agent's
 * behavior lives entirely in its systemPrompt (set at creation); messages
 * carry only the payload, with no contextId (each call is isolated) unless
 * threading is explicitly requested.
 *
 * Agent calls use standard API client credentials. Limited-scope streaming
 * tokens do not grant access to agent endpoints; surface any 403 to the user.
 */
import type { Corti, CortiClient } from "@corti/sdk";

export interface AgentSpec {
  name: string;
  description: string;
  systemPrompt: string;
  /** Model identifier (e.g. "corti-s1-mini-instant"). Tenant default if omitted. */
  model?: string;
  /** "persistent" retains the agent across sessions. Defaults to "ephemeral". */
  lifecycle?: "persistent";
  /** Registry connectors to attach at creation (e.g. pubmed-expert, coding-expert). */
  connectors?: Corti.CommonConnectorCreateRequest[];
}

export interface AgentSendOptions {
  contextId?: string;
  /** Maximum number of prior messages to include as context (v2 only). */
  historyLength?: number;
}

export interface AgentSendResult {
  text: string;
  contextId: string | null;
}

export interface AgentStreamChunk {
  delta: string;
  contextId: string | null;
}

/** Pull the first text part out of a sendMessage response. */
export function extractAgentText(resp: Corti.AgenticAgentsSendMessageResponse): string {
  const messages = [resp.task?.status?.message, resp.message];
  for (const msg of messages) {
    for (const part of msg?.parts ?? []) {
      if (part.text) {
        return part.text;
      }
    }
  }
  for (const artifact of resp.task?.artifacts ?? []) {
    for (const part of artifact.parts ?? []) {
      if (part.text) {
        return part.text;
      }
    }
  }
  return "";
}

/** Return the id of the agent named `spec.name`, creating it if it doesn't exist.
 *  Also reports whether the agent was freshly created (vs. found by name). */
export async function ensureAgentWithMeta(
  client: CortiClient,
  spec: AgentSpec,
): Promise<{ id: string; created: boolean }> {
  const page = await client.agentic.agents.list();
  const raw = (page as { response?: { agents?: unknown[] } }).response;
  const items = raw?.agents ?? [];
  const existing = items.find((a) => (a as { name?: string }).name === spec.name);
  if (existing) {
    return { id: (existing as { id: string }).id, created: false };
  }
  const created = await client.agentic.agents.create({
    name: spec.name,
    description: spec.description,
    systemPrompt: spec.systemPrompt,
    model: spec.model,
    lifecycle: spec.lifecycle,
    connectors: spec.connectors ?? [],
  });
  return { id: created.id, created: true };
}

/** Return the id of the agent named `spec.name`, creating it if it doesn't exist. */
export async function ensureAgent(client: CortiClient, spec: AgentSpec): Promise<string> {
  const { id } = await ensureAgentWithMeta(client, spec);
  return id;
}

/** Send one isolated message to an agent and return its text response. */
export async function sendAgentMessage(
  client: CortiClient,
  agentId: string,
  text: string,
): Promise<string> {
  const result = await sendAgentMessageWithContext(client, agentId, text);
  return result.text;
}

/** Send one message to an agent, optionally inside an existing context/thread. */
export async function sendAgentMessageWithContext(
  client: CortiClient,
  agentId: string,
  text: string,
  options?: AgentSendOptions,
): Promise<AgentSendResult> {
  const resp = await client.agentic.agents.sendMessage(agentId, {
    message: {
      role: "ROLE_USER",
      parts: [{ text }],
      messageId: crypto.randomUUID(),
      contextId: options?.contextId,
    },
    ...(options?.historyLength ? { configuration: { historyLength: options.historyLength } } : {}),
  });
  return {
    text: extractAgentText(resp),
    contextId: resp.task?.contextId ?? resp.message?.contextId ?? null,
  };
}

/** Stream a message to an agent, yielding incremental text chunks via SSE.
 *
 *  Each yielded chunk carries a `delta` (the new text fragment) and the
 *  `contextId` (once the server returns one). The caller accumulates deltas
 *  to build the full response text.
 *
 *  The SDK's Stream yields `AgenticAgentsStreamEventResponse` objects that
 *  extend `A2AsseEvent` (which declares `data: string`), but at runtime the
 *  Fern serializer with `skipValidation` passes the parsed SSE payload through
 *  as top-level properties (`task`, `artifactUpdate`, `statusUpdate`,
 *  `message`). The `data` field is `undefined`. We access the payload
 *  properties directly via a cast. */
interface StreamEventPayload {
  task?: { contextId?: string; id?: string; status?: { state: string } };
  message?: { contextId?: string; parts?: { text?: string }[] };
  statusUpdate?: { contextId?: string; status?: { state: string } };
  artifactUpdate?: {
    contextId?: string;
    artifact?: { parts?: { text?: string }[] };
    append?: boolean;
    lastChunk?: boolean;
  };
}

export async function* streamAgentMessageWithContext(
  client: CortiClient,
  agentId: string,
  text: string,
  options?: AgentSendOptions,
): AsyncGenerator<AgentStreamChunk> {
  const stream = await client.agentic.agents.streamMessage(agentId, {
    message: {
      role: "ROLE_USER",
      parts: [{ text }],
      messageId: crypto.randomUUID(),
      contextId: options?.contextId,
    },
    ...(options?.historyLength ? { configuration: { historyLength: options.historyLength } } : {}),
  });

  let contextId: string | null = null;
  let accumulatedArtifact = "";

  for await (const event of stream) {
    const parsed = event as unknown as StreamEventPayload;

    if (parsed.task?.contextId) {
      contextId = parsed.task.contextId;
    }
    if (parsed.statusUpdate?.contextId) {
      contextId = parsed.statusUpdate.contextId;
    }
    if (parsed.artifactUpdate?.contextId) {
      contextId = parsed.artifactUpdate.contextId;
    }
    if (parsed.message?.contextId) {
      contextId = parsed.message.contextId;
    }

    if (parsed.artifactUpdate?.artifact?.parts) {
      for (const part of parsed.artifactUpdate.artifact.parts) {
        if (part.text) {
          const newText = part.text;
          // The server sends incremental deltas, then a final artifactUpdate
          // with the complete text. When the new text starts with what we've
          // already accumulated, it's a full-text replacement — skip it to
          // avoid duplicating the response.
          if (accumulatedArtifact && newText.startsWith(accumulatedArtifact)) {
            accumulatedArtifact = newText;
            // No delta to yield — the content is unchanged
          } else {
            accumulatedArtifact += newText;
            yield { delta: newText, contextId };
          }
        }
      }
    }
  }
}

/** Human-friendly error message with guidance for a 403 response. */
export function describeAgentError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/403|forbidden/i.test(message)) {
    return "Agent request failed (403). Verify the token scope, tenant, and environment.";
  }
  return message;
}

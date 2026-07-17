/**
 * Thin helpers over the Corti Agentic Framework (`client.agents.*`), following
 * the Tympany pattern: ensure an agent exists by name (create if missing), then
 * send it a message and read the text back. The agent's behavior lives entirely
 * in its systemPrompt (set at creation); messages carry only the payload, with
 * no contextId (each call is isolated).
 *
 * Note: the Agentic Framework must be enabled for the project/region — an
 * authorized-but-not-entitled client gets a 403; surface that to the user.
 */
import type { Corti, CortiClient } from "@corti/sdk";

export interface AgentSpec {
  name: string;
  description: string;
  systemPrompt: string;
}

export interface AgentSendOptions {
  contextId?: string;
}

export interface AgentSendResult {
  text: string;
  contextId: string | null;
}

/** Pull the first text part out of a message:send response. */
export function extractAgentText(resp: Corti.AgentsMessageSendResponse): string {
  const messages = [resp.task?.status?.message, resp.message];
  for (const msg of messages) {
    for (const part of msg?.parts ?? []) {
      if (part.kind === "text" && part.text) {
        return part.text;
      }
    }
  }
  for (const artifact of resp.task?.artifacts ?? []) {
    for (const part of artifact.parts ?? []) {
      if (part.kind === "text" && part.text) {
        return part.text;
      }
    }
  }
  return "";
}

/** Return the id of the agent named `spec.name`, creating it if it doesn't exist. */
export async function ensureAgent(client: CortiClient, spec: AgentSpec): Promise<string> {
  const agents = await client.agents.list();
  const existing = agents.find((a) => a.name === spec.name);
  if (existing) {
    return existing.id;
  }
  const created = await client.agents.create({
    name: spec.name,
    description: spec.description,
    systemPrompt: spec.systemPrompt,
    experts: [],
  });
  return created.id;
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
  const resp = await client.agents.messageSend(agentId, {
    message: {
      role: "user",
      parts: [{ kind: "text", text }],
      messageId: crypto.randomUUID(),
      contextId: options?.contextId,
      kind: "message",
    },
  });
  return {
    text: extractAgentText(resp),
    contextId: resp.task?.contextId ?? resp.message?.contextId ?? null,
  };
}

/** Human-friendly error message, with a hint for the common 403 entitlement case. */
export function describeAgentError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/403|forbidden/i.test(message)) {
    return "Agent request failed (403). The Agentic Framework may not be enabled for this project/region.";
  }
  return message;
}

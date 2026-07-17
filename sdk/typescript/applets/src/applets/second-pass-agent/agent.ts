import type { CortiAuth } from "@corti/sdk";
import { CortiClient } from "@corti/sdk";
import { useSyncExternalStore } from "react";
import {
  type ConfigStore,
  createLocalConfigStore,
  identityNamespace,
} from "../_shared/configStore";
import {
  type AgentSpec,
  describeAgentError,
  ensureAgent,
  sendAgentMessage,
} from "../_shared/cortiAgent";
import type { CortiSdkEnvironment } from "../_shared/useCortiAccessToken";

export const SECOND_PASS_AGENT = {
  name: "Second Pass",
  description:
    "Second-pass LLM processor for transcript results generated from uploaded or archived audio.",
};

export const DEFAULT_PROMPT = `You are a second-pass processor for healthcare transcripts.
You will receive transcript text that may include speaker or channel labels.
Produce a concise, clinically useful output from that transcript.
Preserve important medications, numbers, units, timing, and uncertainty.
Return only the final result with no preamble, labels, or markdown fences.`;

const PROMPT_KEY = "secondPass.systemPrompt";
const AGENT_ID_KEY = "secondPass.agentId";

export type SecondPassAgentStatus = "idle" | "preparing" | "ready" | "running" | "error";

interface SecondPassAgentState {
  prompt: string;
  status: SecondPassAgentStatus;
  error?: string;
}

let client: CortiClient | null = null;
let lastAuth: CortiAuth.AuthTokenDerivable | null = null;
let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);
let agentId: string | null = null;
let preparedFor: string | null = null;

let state: SecondPassAgentState = {
  prompt: DEFAULT_PROMPT,
  status: "idle",
};

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};
const set = (patch: Partial<SecondPassAgentState>) => {
  state = { ...state, ...patch };
  emit();
};

const spec = (): AgentSpec => ({
  ...SECOND_PASS_AGENT,
  systemPrompt: state.prompt,
});

async function prepare() {
  if (!client) {
    return;
  }
  set({ status: "preparing", error: undefined });
  try {
    if (!agentId) {
      agentId = await ensureAgent(client, spec());
      store.set(AGENT_ID_KEY, agentId);
    }
    set({ status: "ready" });
  } catch (error) {
    set({ status: "error", error: describeAgentError(error) });
  }
}

export function configureSecondPassAgent(
  authConfig: CortiAuth.AuthTokenDerivable,
  environment: CortiSdkEnvironment,
  clientId?: string,
  tenant?: string,
) {
  if (authConfig !== lastAuth) {
    lastAuth = authConfig;
    client = new CortiClient({ environment, auth: authConfig });
  }

  const nextNamespace = identityNamespace(clientId, tenant);
  if (nextNamespace !== namespace) {
    namespace = nextNamespace;
    store = createLocalConfigStore(nextNamespace);
    agentId = store.get<string>(AGENT_ID_KEY, "") || null;
    preparedFor = null;
    set({
      prompt: store.get<string>(PROMPT_KEY, "") || DEFAULT_PROMPT,
      status: "idle",
      error: undefined,
    });
  }

  if (client && preparedFor !== namespace) {
    preparedFor = namespace;
    void prepare();
  }
}

export async function savePrompt(prompt: string) {
  store.set(PROMPT_KEY, prompt);
  set({ prompt });
  if (!client || !agentId) {
    return;
  }

  set({ status: "preparing", error: undefined });
  try {
    await client.agents.update(agentId, { systemPrompt: prompt });
    set({ status: "ready" });
  } catch (error) {
    set({ status: "error", error: describeAgentError(error) });
  }
}

export const resetPrompt = () => savePrompt(DEFAULT_PROMPT);

export function exportAgent() {
  const payload = {
    agent: { ...SECOND_PASS_AGENT, systemPrompt: state.prompt },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "corti-second-pass-agent.json";
  link.click();
  URL.revokeObjectURL(url);
}

export async function runSecondPassAgent(text: string): Promise<string> {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error("Nothing to send to the second-pass agent yet.");
  }
  if (!client) {
    throw new Error("The second-pass agent is not configured yet.");
  }

  set({ status: "running", error: undefined });
  try {
    if (!agentId) {
      agentId = await ensureAgent(client, spec());
      store.set(AGENT_ID_KEY, agentId);
    }
    let output = "";
    try {
      output = await sendAgentMessage(client, agentId, normalized);
    } catch (error) {
      if (/404|not.?found/i.test(String(error))) {
        agentId = await ensureAgent(client, spec());
        store.set(AGENT_ID_KEY, agentId);
        output = await sendAgentMessage(client, agentId, normalized);
      } else {
        throw error;
      }
    }
    if (!output.trim()) {
      throw new Error("Agent returned no text.");
    }
    set({ status: "ready" });
    return output;
  } catch (error) {
    const message = describeAgentError(error);
    set({ status: "error", error: message });
    throw new Error(message);
  }
}

export function useSecondPassAgentStore(): SecondPassAgentState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

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
import { EXAMPLES_ANALYTICS } from "../_shared/examplesAnalytics";
import type { CortiSdkEnvironment } from "../_shared/useCortiAccessToken";
import {
  type AgentEntry,
  agentStore,
  CLINICAL_SUMMARY_PROMPT,
  setAgentLibraryIdentity,
  setSelectedAgentId,
  setSelectionIdentity,
} from "./agentLibrary";

export {
  type AgentEntry,
  type AgentOrigin,
  agentOrigin,
  agentStore,
  isCatalogAgent,
  removeAgentEntry,
  saveAgentEntry,
  setSelectedAgentId,
  toExport as toExportAgents,
  useAgentLibrary,
  useSelectedAgentId,
} from "./agentLibrary";

export const SECOND_PASS_AGENT = {
  name: "Second Pass",
  description:
    "Second-pass LLM processor for transcript results generated from uploaded or archived audio.",
};

export const DEFAULT_PROMPT = CLINICAL_SUMMARY_PROMPT;

export type SecondPassAgentStatus = "idle" | "preparing" | "ready" | "running" | "error";

interface SecondPassAgentState {
  status: SecondPassAgentStatus;
  error?: string;
  /** The name of the currently active agent entry. */
  activeName: string;
}

let client: CortiClient | null = null;
let lastRefresh: CortiAuth.AuthTokenDerivable["refreshAccessToken"] | null = null;
let lastEnv: CortiSdkEnvironment | null = null;
let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);
let agentId: string | null = null;
/** The prompt currently installed on the remote agent, or null when unknown. */
let installedPrompt: string | null = null;
/** The entry currently selected — tracked so runSecondPassAgent can rebuild the spec. */
let currentEntry: AgentEntry | null = null;

let state: SecondPassAgentState = {
  status: "idle",
  activeName: "",
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

let syncChain: Promise<void> = Promise.resolve();

const AGENT_ID_KEY = "secondPass.agentId";

function spec(prompt: string): AgentSpec {
  return {
    ...SECOND_PASS_AGENT,
    systemPrompt: prompt,
    model: "corti-s1-mini",
    lifecycle: "persistent",
  };
}

async function syncPrompt(entry: AgentEntry) {
  if (!client) {
    return;
  }
  currentEntry = entry;
  set({ status: "preparing", error: undefined, activeName: entry.name });
  if (!agentId) {
    agentId = await ensureAgent(client, spec(entry.prompt));
    store.set(AGENT_ID_KEY, agentId);
    installedPrompt = null;
  }
  if (installedPrompt === entry.prompt) {
    set({ status: "ready" });
    return;
  }
  await client.agentic.agents.update(agentId, { systemPrompt: entry.prompt });
  installedPrompt = entry.prompt;
  set({ status: "ready" });
}

function queueSync(entry: AgentEntry): Promise<void> {
  syncChain = syncChain
    .then(() => syncPrompt(entry))
    .catch((e: unknown) => {
      set({ status: "error", error: describeAgentError(e) });
    });
  return syncChain;
}

export function configureSecondPassAgent(
  authConfig: CortiAuth.AuthTokenDerivable,
  environment: CortiSdkEnvironment,
  clientId?: string,
  tenant?: string,
) {
  if (
    authConfig.refreshAccessToken !== lastRefresh ||
    environment.base !== lastEnv?.base ||
    environment.wss !== lastEnv?.wss ||
    environment.login !== lastEnv?.login ||
    environment.agents !== lastEnv?.agents
  ) {
    lastRefresh = authConfig.refreshAccessToken;
    lastEnv = environment;
    client = new CortiClient({ environment, auth: authConfig, analytics: EXAMPLES_ANALYTICS });
  }

  const nextNamespace = identityNamespace(clientId, tenant);
  if (nextNamespace !== namespace) {
    namespace = nextNamespace;
    store = createLocalConfigStore(nextNamespace);
    agentId = store.get<string>(AGENT_ID_KEY, "") || null;
    installedPrompt = null;
    currentEntry = null;
    set({ status: "idle", error: undefined, activeName: "" });
  }

  setAgentLibraryIdentity(clientId, tenant);
  setSelectionIdentity(clientId, tenant);
}

/** Install a specific agent entry's prompt on the platform agent. */
export function selectAgent(entry: AgentEntry) {
  setSelectedAgentId(entry.id);
  void queueSync(entry);
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
      if (!currentEntry) {
        const library = agentStore.getItems();
        currentEntry = library[0] ?? null;
      }
      if (!currentEntry) {
        throw new Error("No agent selected. Pick one from the dropdown.");
      }
      agentId = await ensureAgent(client, spec(currentEntry.prompt));
      store.set(AGENT_ID_KEY, agentId);
      installedPrompt = currentEntry.prompt;
    }
    let output = "";
    try {
      output = await sendAgentMessage(client, agentId, normalized);
    } catch (error) {
      if (/404|not.?found/i.test(String(error))) {
        const prompt = currentEntry?.prompt ?? installedPrompt ?? DEFAULT_PROMPT;
        agentId = await ensureAgent(client, spec(prompt));
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

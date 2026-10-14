/** Three-agent pipeline: context organization → justification writing → PA request formatting. */

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

export const CONTEXT_ORGANIZER_AGENT: AgentSpec = {
  name: "PA Context Organizer",
  description: "Organizes clinical context for a prior authorization request.",
  systemPrompt: `You are a clinical documentation specialist. Extract and organize the clinical context needed for a prior authorization request from the provided note or transcript.

Format output as:
**Diagnosis:** ...
**Clinical Findings:** ...
**Treatments Previously Tried:** ...
**Requested Treatment or Service:** ...
**Urgency:** Routine / Urgent / Emergent

Return only the organized context.`,
};

export const JUSTIFICATION_WRITER_AGENT: AgentSpec = {
  name: "PA Justification Writer",
  description: "Writes a payer-facing medical necessity justification.",
  systemPrompt: `You are a clinical documentation specialist writing for a payer audience. Using the provided clinical context, write a concise medical necessity justification for a prior authorization request.

Write 2–4 professional sentences covering:
1. The patient's condition and clinical need
2. Why the requested treatment or service is medically necessary
3. Any alternatives previously tried or considered

Use clear, payer-oriented language. Return only the justification paragraph.`,
};

export const REQUEST_FORMATTER_AGENT: AgentSpec = {
  name: "PA Request Formatter",
  description: "Formats organized context and justification into a prior authorization request.",
  systemPrompt: `You are a clinical documentation specialist. Format the provided content into a concise, structured prior authorization request.

Output:
**Patient Diagnosis:** ...
**Requested Service or Treatment:** ...
**Medical Necessity Justification:** [the provided justification paragraph]
**Supporting Clinical Evidence:** ...
**Urgency Classification:** Routine / Urgent / Emergent

Return only the formatted request.`,
};

export type PriorAuthStatus = "idle" | "running" | "done" | "error";

export interface PriorAuthState {
  status: PriorAuthStatus;
  stage: number;
  stage1Output: string;
  stage2Output: string;
  stage3Output: string;
  error?: string;
}

const AGENT1_ID_KEY = "priorAuth.agent1Id";
const AGENT2_ID_KEY = "priorAuth.agent2Id";
const AGENT3_ID_KEY = "priorAuth.agent3Id";

let client: CortiClient | null = null;
let lastAuth: CortiAuth.AuthTokenDerivable | null = null;
let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);
let agent1Id: string | null = null;
let agent2Id: string | null = null;
let agent3Id: string | null = null;
let preparedFor: string | null = null;
/**
 * Bumped by configurePriorAuth whenever `client` or `namespace` changes.
 * A run captures the version at start; if it no longer matches once a stage
 * is about to execute, the run aborts instead of silently continuing against
 * a newer tenant's client/agent ids.
 */
let configVersion = 0;

let state: PriorAuthState = {
  status: "idle",
  stage: 0,
  stage1Output: "",
  stage2Output: "",
  stage3Output: "",
};

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (patch: Partial<PriorAuthState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => {
    l();
  });
};

async function prepare() {
  if (!client) {
    return;
  }
  try {
    if (!agent1Id) {
      agent1Id = await ensureAgent(client, CONTEXT_ORGANIZER_AGENT);
      store.set(AGENT1_ID_KEY, agent1Id);
    }
    if (!agent2Id) {
      agent2Id = await ensureAgent(client, JUSTIFICATION_WRITER_AGENT);
      store.set(AGENT2_ID_KEY, agent2Id);
    }
    if (!agent3Id) {
      agent3Id = await ensureAgent(client, REQUEST_FORMATTER_AGENT);
      store.set(AGENT3_ID_KEY, agent3Id);
    }
  } catch {
    /* non-fatal: agents created lazily on first run */
  }
}

export function configurePriorAuth(
  authConfig: CortiAuth.AuthTokenDerivable,
  environment: CortiSdkEnvironment,
  clientId?: string,
  tenant?: string,
) {
  if (authConfig !== lastAuth) {
    lastAuth = authConfig;
    client = new CortiClient({ environment, auth: authConfig, analytics: EXAMPLES_ANALYTICS });
    configVersion++;
  }
  const ns = identityNamespace(clientId, tenant);
  if (ns !== namespace) {
    namespace = ns;
    store = createLocalConfigStore(ns);
    agent1Id = store.get<string>(AGENT1_ID_KEY, "") || null;
    agent2Id = store.get<string>(AGENT2_ID_KEY, "") || null;
    agent3Id = store.get<string>(AGENT3_ID_KEY, "") || null;
    preparedFor = null;
    configVersion++;
  }
  if (client && preparedFor !== namespace) {
    preparedFor = namespace;
    void prepare();
  }
}

async function getOrCreate(
  agentClient: CortiClient,
  agentStore: ConfigStore,
  agentSpec: AgentSpec,
  cachedId: string | null,
  idKey: string,
): Promise<string> {
  if (cachedId) {
    return cachedId;
  }
  const id = await ensureAgent(agentClient, agentSpec);
  agentStore.set(idKey, id);
  return id;
}

export async function runPriorAuth(input: string) {
  if (!input.trim() || !client) {
    return;
  }
  // Capture this run's client/store/agent ids once up front so a
  // configurePriorAuth() call mid-run (tenant/identity change) can never
  // cause a later stage to silently execute against a different client.
  const runClient = client;
  const runStore = store;
  const runVersion = configVersion;
  let runAgent1Id = agent1Id;
  let runAgent2Id = agent2Id;
  let runAgent3Id = agent3Id;

  const assertStillCurrent = () => {
    if (configVersion !== runVersion) {
      throw new Error(
        "Tenant configuration changed while the pipeline was running; aborted to avoid mixing tenant contexts.",
      );
    }
  };

  set({
    status: "running",
    stage: 1,
    stage1Output: "",
    stage2Output: "",
    stage3Output: "",
    error: undefined,
  });
  try {
    runAgent1Id = await getOrCreate(
      runClient,
      runStore,
      CONTEXT_ORGANIZER_AGENT,
      runAgent1Id,
      AGENT1_ID_KEY,
    );
    const out1 = await sendAgentMessage(runClient, runAgent1Id, input);
    set({ stage1Output: out1, stage: 2 });

    assertStillCurrent();
    runAgent2Id = await getOrCreate(
      runClient,
      runStore,
      JUSTIFICATION_WRITER_AGENT,
      runAgent2Id,
      AGENT2_ID_KEY,
    );
    const out2 = await sendAgentMessage(runClient, runAgent2Id, out1);
    set({ stage2Output: out2, stage: 3 });

    assertStillCurrent();
    runAgent3Id = await getOrCreate(
      runClient,
      runStore,
      REQUEST_FORMATTER_AGENT,
      runAgent3Id,
      AGENT3_ID_KEY,
    );
    const out3 = await sendAgentMessage(
      runClient,
      runAgent3Id,
      `${out1}\n\nJustification:\n${out2}`,
    );
    set({ stage3Output: out3, status: "done" });

    // Sync the resolved ids back to the module-level cache only if this
    // run's tenant/client is still the current one, so a same-tenant rerun
    // can reuse them without re-resolving via ensureAgent.
    if (configVersion === runVersion) {
      agent1Id = runAgent1Id;
      agent2Id = runAgent2Id;
      agent3Id = runAgent3Id;
    }
  } catch (e) {
    if (/404|not.?found/i.test(String(e))) {
      // This run's cached ids are confirmed stale for its own tenant.
      runStore.set(AGENT1_ID_KEY, "");
      runStore.set(AGENT2_ID_KEY, "");
      runStore.set(AGENT3_ID_KEY, "");
      if (configVersion === runVersion) {
        agent1Id = null;
        agent2Id = null;
        agent3Id = null;
      }
    }
    set({ status: "error", error: describeAgentError(e) });
  }
}

export function usePriorAuthStore(): PriorAuthState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

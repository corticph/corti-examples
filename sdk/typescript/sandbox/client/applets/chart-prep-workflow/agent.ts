/** Three-agent pipeline: fact extraction → note drafting → code suggestion. */

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

export const FACT_EXTRACTOR_AGENT: AgentSpec = {
  name: "Chart Fact Extractor",
  description: "Extracts structured clinical facts from transcripts for chart preparation.",
  systemPrompt: `You are a clinical data specialist. Extract structured clinical facts from the provided transcript or note.

Format your output as:
**Chief Complaint:** ...
**Symptoms:** ...
**Relevant History:** ...
**Examination Findings:** ...
**Vitals:** ...
**Current Medications:** ...
**Allergies:** ...

Use only information present in the text. Omit sections with no data. Return only the extracted facts.`,
};

export const NOTE_DRAFTER_AGENT: AgentSpec = {
  name: "Chart Note Drafter",
  description: "Drafts a structured clinical note from extracted facts.",
  systemPrompt: `You are a clinical documentation specialist. Using the provided structured clinical facts, draft a concise SOAP note.

Output:
**Subjective:** ...
**Objective:** ...
**Assessment:** ...
**Plan:** ...

Use only the provided facts. If a section has no data, write "Not documented." Return only the SOAP note.`,
};

export const CODE_SUGGESTER_AGENT: AgentSpec = {
  name: "Chart Code Suggester",
  description: "Suggests ICD-10-CM codes from a drafted clinical note.",
  systemPrompt: `You are a medical coding specialist. Suggest ICD-10-CM codes for the provided clinical note.

Format output as a list:
- [CODE] Description — Brief rationale

Include up to 5 codes, most relevant first. Return only the formatted code list.`,
};

export type ChartPrepStatus = "idle" | "running" | "done" | "error";

export interface ChartPrepState {
  status: ChartPrepStatus;
  stage: number;
  stage1Output: string;
  stage2Output: string;
  stage3Output: string;
  error?: string;
}

const AGENT1_ID_KEY = "chartPrep.agent1Id";
const AGENT2_ID_KEY = "chartPrep.agent2Id";
const AGENT3_ID_KEY = "chartPrep.agent3Id";

let client: CortiClient | null = null;
let lastAuth: CortiAuth.AuthTokenDerivable | null = null;
let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);
let agent1Id: string | null = null;
let agent2Id: string | null = null;
let agent3Id: string | null = null;
let preparedFor: string | null = null;
/**
 * Bumped by configureChartPrep whenever `client` or `namespace` changes.
 * A run captures the version at start; if it no longer matches once a stage
 * is about to execute, the run aborts instead of silently continuing against
 * a newer tenant's client/agent ids.
 */
let configVersion = 0;

let state: ChartPrepState = {
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
const set = (patch: Partial<ChartPrepState>) => {
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
      agent1Id = await ensureAgent(client, FACT_EXTRACTOR_AGENT);
      store.set(AGENT1_ID_KEY, agent1Id);
    }
    if (!agent2Id) {
      agent2Id = await ensureAgent(client, NOTE_DRAFTER_AGENT);
      store.set(AGENT2_ID_KEY, agent2Id);
    }
    if (!agent3Id) {
      agent3Id = await ensureAgent(client, CODE_SUGGESTER_AGENT);
      store.set(AGENT3_ID_KEY, agent3Id);
    }
  } catch {
    /* non-fatal: agents created lazily on first run */
  }
}

export function configureChartPrep(
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

export async function runChartPrep(input: string) {
  if (!input.trim() || !client) {
    return;
  }
  // Capture this run's client/store/agent ids once up front so a
  // configureChartPrep() call mid-run (tenant/identity change) can never
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
      FACT_EXTRACTOR_AGENT,
      runAgent1Id,
      AGENT1_ID_KEY,
    );
    const out1 = await sendAgentMessage(runClient, runAgent1Id, input);
    set({ stage1Output: out1, stage: 2 });

    assertStillCurrent();
    runAgent2Id = await getOrCreate(
      runClient,
      runStore,
      NOTE_DRAFTER_AGENT,
      runAgent2Id,
      AGENT2_ID_KEY,
    );
    const out2 = await sendAgentMessage(runClient, runAgent2Id, out1);
    set({ stage2Output: out2, stage: 3 });

    assertStillCurrent();
    runAgent3Id = await getOrCreate(
      runClient,
      runStore,
      CODE_SUGGESTER_AGENT,
      runAgent3Id,
      AGENT3_ID_KEY,
    );
    const out3 = await sendAgentMessage(runClient, runAgent3Id, out2);
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

export function useChartPrepStore(): ChartPrepState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

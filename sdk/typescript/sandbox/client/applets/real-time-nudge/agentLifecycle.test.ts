import type { CortiClient } from "@corti/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  agents: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    messageSend: vi.fn(),
  },
  agentic: {
    agents: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));
vi.mock("@corti/sdk", () => ({
  CortiClient: class {
    agents = mock.agents;
    agentic = mock.agentic;
  },
}));
vi.mock("react", () => ({
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) =>
    snapshot(),
}));

import {
  createLocalConfigStore,
  identityNamespace,
} from "../_shared/configStore";
import { CATALOG } from "./nudgeRules";
import { codeCriteria } from "./evaluation";
import {
  configureNudgeAgent,
  DEFAULT_SYSTEM_PROMPT,
  evaluateCodesWithAgent,
  evaluatePromptWithAgent,
  resetNudgeAgentSession,
  saveAgentPrompt,
  useNudgeAgentPrompt,
} from "./snomedAgent";

const client = mock as unknown as CortiClient;
const env = {
  base: "https://test/v2",
  agents: "https://test",
  wss: "wss://test",
  login: "https://test/login",
};
const emptyNudgeState = { triggered: [], resolved: [], dismissed: [] };
function setup(tenant = "a") {
  mock.agents.list.mockResolvedValue([
    { id: "code", name: "Nudge Code Evaluator" },
    { id: "prompt", name: "Nudge Prompt Evaluator" },
  ]);
  mock.agents.create.mockResolvedValue({ id: "new", name: "test" });
  mock.agents.update.mockResolvedValue({});
  mock.agents.messageSend.mockImplementation(async (_id, req) => {
    const payload = JSON.parse(req.message.parts[0].text);
    return {
      message: {
        parts: [
          {
            kind: "text",
            text: JSON.stringify({
              decisions: payload.criteria.map(
                (c: { id: string; condition?: string }) => ({
                  id: c.id,
                  outcome: c.condition === "absent" ? "matched" : "not-matched",
                }),
              ),
            }),
          },
        ],
        contextId: req.message.contextId ?? "ctx-test-1",
      },
    };
  });
  configureNudgeAgent({ accessToken: "test" }, env, "client", tenant, "eu");
}
afterEach(() => {
  resetNudgeAgentSession();
  vi.resetAllMocks();
});

const memStore = new Map<string, string>();
beforeEach(() => {
  memStore.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memStore.get(k) ?? null,
    setItem: (k: string, v: string) => memStore.set(k, v),
    removeItem: (k: string) => memStore.delete(k),
    clear: () => memStore.clear(),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("agent lifecycle and completed caches", () => {
  it("keeps prompt IDs paired with prompts and never reuses results across tenant changes", async () => {
    setup();
    const req = {
      text: "note",
      criteria: [
        { id: "a", prompt: "A" },
        { id: "b", prompt: "B" },
      ],
    };
    await evaluatePromptWithAgent(client, req);
    await evaluatePromptWithAgent(client, req);
    expect(mock.agents.messageSend).toHaveBeenCalledTimes(1);
    await evaluatePromptWithAgent(client, {
      ...req,
      criteria: [
        { id: "a", prompt: "B" },
        { id: "b", prompt: "A" },
      ],
    });
    expect(mock.agents.messageSend).toHaveBeenCalledTimes(2);
    setup("b");
    await evaluatePromptWithAgent(client, req);
    expect(mock.agents.messageSend).toHaveBeenCalledTimes(3);
    expect(mock.agents.list).toHaveBeenCalledTimes(4);
  });
  it("keeps the active agent revision and cache across token refresh", async () => {
    setup();
    const req = { text: "note", criteria: [{ id: "a", prompt: "A" }] };
    await evaluatePromptWithAgent(client, req);
    const revision = useNudgeAgentPrompt().revision;
    configureNudgeAgent({ accessToken: "refreshed" }, env, "client", "a", "eu");
    expect(useNudgeAgentPrompt().revision).toBe(revision);
    await evaluatePromptWithAgent(client, req);
    expect(mock.agents.messageSend).toHaveBeenCalledTimes(1);
    expect(mock.agents.list).toHaveBeenCalledTimes(2);
  });

  it("evaluates absence-only criteria with empty predictions", async () => {
    setup();
    const rule = {
      ...CATALOG[2],
      trigger: {
        icd10: {
          mode: "all" as const,
          conditions: [
            { code: "I50.9", op: "=" as const, condition: "absent" as const },
          ],
        },
      },
      resolve: {},
    };
    const result = await evaluateCodesWithAgent(client, {
      text: "No diagnoses documented",
      codes: { codes: [], candidates: [], usageInfo: { creditsConsumed: 0 } },
      criteria: codeCriteria([rule]),
      nudgeState: emptyNudgeState,
    });
    // op="=" criteria are pre-evaluated client-side — agent is not called.
    expect(mock.agents.messageSend).not.toHaveBeenCalled();
    expect(result.decisions[0].outcome).toBe("matched");
  });
  it("keeps the active prompt/revision unchanged when the remote update fails", async () => {
    setup();
    const before = useNudgeAgentPrompt();
    mock.agents.update.mockRejectedValue(new Error("offline"));
    await saveAgentPrompt("New prompt");
    expect(useNudgeAgentPrompt()).toMatchObject({
      prompt: before.prompt,
      revision: before.revision,
      status: "error",
    });
  });
  it("activates a successfully synchronized prompt and reinitializes after environment change", async () => {
    setup();
    const before = useNudgeAgentPrompt().revision;
    await saveAgentPrompt("New prompt");
    expect(useNudgeAgentPrompt()).toMatchObject({
      prompt: "New prompt",
      revision: before + 1,
      status: "ready",
    });
    const saveCall = mock.agents.update.mock.calls.find(
      ([, arg]) =>
        typeof arg?.systemPrompt === "string" &&
        arg.systemPrompt.startsWith("New prompt"),
    );
    expect(saveCall?.[1].systemPrompt).toContain(
      "Required response protocol v4",
    );
    configureNudgeAgent({ accessToken: "test" }, env, "client", "a", "us");
    await evaluatePromptWithAgent(client, {
      text: "note",
      criteria: [{ id: "a", prompt: "A" }],
    });
    expect(mock.agents.list).toHaveBeenCalledTimes(4);
  });
  it("does not cache incomplete responses", async () => {
    setup();
    mock.agents.messageSend.mockResolvedValue({
      message: { parts: [{ kind: "text", text: '{"decisions":[]}' }] },
    });
    const req = { text: "note", criteria: [{ id: "a", prompt: "A" }] };
    expect(
      (await evaluatePromptWithAgent(client, req)).decisions[0].outcome,
    ).toBe("unknown");
    await evaluatePromptWithAgent(client, req);
    expect(mock.agents.messageSend).toHaveBeenCalledTimes(2);
  });

  it("caches identical code agent requests via RequestStage", async () => {
    setup();
    const req = {
      text: "CHF documented",
      codes: { codes: [], candidates: [], usageInfo: { creditsConsumed: 0 } },
      criteria: codeCriteria([CATALOG[1]]),
      nudgeState: emptyNudgeState,
    };
    await evaluateCodesWithAgent(client, req);
    expect(mock.agents.messageSend).toHaveBeenCalledTimes(1);
    // Same request → cached, no second agent call
    await evaluateCodesWithAgent(client, req);
    expect(mock.agents.messageSend).toHaveBeenCalledTimes(1);
  });

  it("does not call agents.update when creating a new agent", async () => {
    mock.agents.list.mockResolvedValue([]);
    mock.agents.create.mockImplementation(async (spec: { name: string }) => ({
      id: `new-${spec.name}`,
      name: spec.name,
    }));
    mock.agents.update.mockResolvedValue({});
    mock.agents.messageSend.mockImplementation(async () => ({
      message: {
        parts: [{ kind: "text", text: '{"decisions":[]}' }],
      },
    }));
    configureNudgeAgent({ accessToken: "test" }, env, "client", "fresh", "eu");
    const req = {
      text: "note",
      codes: { codes: [], candidates: [], usageInfo: { creditsConsumed: 0 } },
      criteria: codeCriteria([CATALOG[1]]),
      nudgeState: emptyNudgeState,
    };
    await evaluateCodesWithAgent(client, req);
    expect(mock.agents.create).toHaveBeenCalled();
    expect(mock.agents.update).not.toHaveBeenCalled();
  });

  it("includes nudgeState in the agent request payload", async () => {
    setup();
    const nudgeState = {
      triggered: ["chf-specificity-snomed"],
      resolved: [],
      dismissed: ["old-rule"],
    };
    const req = {
      text: "CHF",
      codes: { codes: [], candidates: [], usageInfo: { creditsConsumed: 0 } },
      criteria: codeCriteria([CATALOG[1]]),
      nudgeState,
    };
    await evaluateCodesWithAgent(client, req, false);
    const payload = JSON.parse(
      mock.agents.messageSend.mock.calls[0][1].message.parts[0].text,
    );
    expect(payload.nudgeState).toEqual(nudgeState);
  });

  it("sends full clinicalText on every call (stateless)", async () => {
    setup();
    const req = {
      text: "CHF",
      codes: { codes: [], candidates: [], usageInfo: { creditsConsumed: 0 } },
      criteria: codeCriteria([CATALOG[1]]),
      nudgeState: emptyNudgeState,
    };
    await evaluateCodesWithAgent(client, req, false);
    const firstCall = mock.agents.messageSend.mock.calls[0][1];
    expect(firstCall.message.contextId).toBeUndefined();
    const firstPayload = JSON.parse(firstCall.message.parts[0].text);
    expect(firstPayload.clinicalText).toBe("CHF");
    expect(firstPayload.appendedText).toBeUndefined();

    // Second call: still full text, no contextId (stateless)
    await evaluateCodesWithAgent(
      client,
      { ...req, text: "CHF more text" },
      false,
    );
    const secondCall = mock.agents.messageSend.mock.calls[1][1];
    expect(secondCall.message.contextId).toBeUndefined();
    const secondPayload = JSON.parse(secondCall.message.parts[0].text);
    expect(secondPayload.clinicalText).toBe("CHF more text");
    expect(secondPayload.appendedText).toBeUndefined();
  });

  it("caches identical code agent requests", async () => {
    setup();
    const req = {
      text: "CHF",
      codes: { codes: [], candidates: [], usageInfo: { creditsConsumed: 0 } },
      criteria: codeCriteria([CATALOG[1]]),
      nudgeState: emptyNudgeState,
    };
    // First call — cached
    await evaluateCodesWithAgent(client, req);
    // Same text — should hit cache (no second call)
    await evaluateCodesWithAgent(client, req);
    expect(mock.agents.messageSend).toHaveBeenCalledTimes(1);
    // Different text — new call
    await evaluateCodesWithAgent(client, { ...req, text: "CHF more" });
    expect(mock.agents.messageSend).toHaveBeenCalledTimes(2);
    // Same as first — cache hit
    await evaluateCodesWithAgent(client, req);
    expect(mock.agents.messageSend).toHaveBeenCalledTimes(2);
  });

  it("discards stale stored prompt when default version changes", async () => {
    const scope = JSON.stringify([identityNamespace("client", "a"), env, "eu"]);
    const store = createLocalConfigStore(`nudge-v2:${scope}`);
    store.set("systemPrompt", "old default from v1");
    store.set("systemPromptVersion", 1);
    setup();
    expect(store.get("systemPromptVersion", 0)).toBe(7);
    expect(store.get("systemPrompt", "")).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it("handles agents.list() returning { items: [...] } wrapper", async () => {
    mock.agents.list.mockResolvedValue({
      items: [
        { id: "code", name: "Nudge Code Evaluator" },
        { id: "prompt", name: "Nudge Prompt Evaluator" },
      ],
    });
    mock.agents.create.mockResolvedValue({ id: "new", name: "test" });
    mock.agents.update.mockResolvedValue({});
    mock.agents.messageSend.mockResolvedValue({
      message: {
        parts: [{ kind: "text", text: '{"decisions":[]}' }],
        contextId: "ctx-1",
      },
    });
    configureNudgeAgent(
      { accessToken: "test" },
      env,
      "client",
      "items-test",
      "eu",
    );
    const req = { text: "note", criteria: [{ id: "a", prompt: "A" }] };
    await evaluatePromptWithAgent(client, req);
    expect(mock.agents.messageSend).toHaveBeenCalledTimes(1);
  });
});

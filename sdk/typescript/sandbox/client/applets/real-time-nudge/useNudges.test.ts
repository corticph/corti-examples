import type { Corti } from "@corti/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal hook runner: rerenders retain refs/state and effects obey dependency
// changes. Network completion and parent rerenders are controlled independently.
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: {
    current?: unknown;
    value?: unknown;
    set?: (next: unknown) => void;
    callback?: unknown;
    deps?: unknown[];
    cleanup?: (() => void) | undefined;
  }[] = [];
  let effects: (() => void)[] = [];
  const same = (a: unknown[] = [], b: unknown[]) =>
    a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  return {
    reset() {
      cursor = 0;
      slots.length = 0;
      effects = [];
    },
    begin() {
      cursor = 0;
    },
    flush() {
      const pending = effects;
      effects = [];
      pending.forEach((f) => {
        f();
      });
    },
    useRef(value: unknown) {
      const index = cursor++;
      slots[index] ??= { current: value };
      return slots[index];
    },
    useState(value: unknown) {
      const index = cursor++;
      if (!slots[index]) {
        const state = {
          value,
          set: (next: unknown) => {
            state.value = typeof next === "function" ? next(state.value) : next;
          },
        };
        slots[index] = state;
      }
      return [slots[index].value, slots[index].set];
    },
    useCallback(callback: unknown, deps: unknown[]) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) {
        slots[index] = { callback, deps };
      }
      return slots[index].callback;
    },
    useEffect(effect: () => undefined | (() => void), deps: unknown[]) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps };
        effects.push(() => {
          previous?.cleanup?.();
          slots[index].cleanup = effect();
        });
      }
    },
  };
});
vi.mock("react", () => hooks);
vi.mock("../_shared/sessionState", () => ({
  useSessionState: (_key: string, initial: unknown) => hooks.useState(initial),
}));
vi.mock("./cadenceDetector", () => ({ attachCadenceDetector: () => ({ detach: vi.fn() }) }));
vi.mock("./snomedAgent", () => ({ pushDebugEntry: vi.fn() }));

import { nudgeConnectionState } from "./connectionState";
import { criterionId, type EvaluationResponse } from "./evaluation";
import { CATALOG } from "./nudgeRules";
import { pushDebugEntry } from "./snomedAgent";
import { type UseNudgesOptions, useNudges } from "./useNudges";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const prediction: Corti.CodesGeneralResponse = {
  codes: [{ system: "icd10cm-outpatient", code: "I50.9", display: "Heart failure" }],
  candidates: [],
  usageInfo: { creditsConsumed: 0 },
};

beforeEach(() => {
  hooks.reset();
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("prompt and code evaluation orchestration", () => {
  function setup() {
    const pending = deferred<Corti.CodesGeneralResponse>();
    const editor = { current: { textContent: "Patient has heart failure." } as HTMLElement };
    const codeAgent = vi.fn().mockResolvedValue({
      decisions: [
        ...(CATALOG[2].trigger.icd10?.conditions ?? []).map((_, index) => ({
          id: criterionId(CATALOG[2].id, "trigger", "icd10", index),
          outcome: "matched",
        })),
        ...(CATALOG[2].resolve.icd10?.conditions ?? []).map((_, index) => ({
          id: criterionId(CATALOG[2].id, "resolve", "icd10", index),
          outcome: "not-matched",
        })),
      ],
    });
    const promptAgent = vi.fn().mockResolvedValue({ decisions: [] });
    const opts: UseNudgesOptions = {
      evaluationScope: "tenant-a",
      codeEnabled: true,
      agentEnabled: true,
      promptEnabled: true,
      onPredict: vi.fn().mockReturnValue(pending.promise),
      onAgentEvaluate: codeAgent,
      onPromptEvaluate: promptAgent,
    };
    const rules = [CATALOG[2], CATALOG[9]];
    const render = (options = opts, activeRules = rules) => {
      hooks.begin();
      const result = useNudges(editor, activeRules, options);
      hooks.flush();
      return result;
    };
    return { pending, editor, codeAgent, promptAgent, opts, rules, render };
  }

  it("keeps each spinner active until its own request finishes across rerenders", async () => {
    const t = setup();
    const prompt = deferred<EvaluationResponse>();
    const code = deferred<EvaluationResponse>();
    t.promptAgent.mockReturnValue(prompt.promise);
    t.codeAgent.mockReturnValue(code.promise);
    t.render().onCadenceEvent({ type: "edit" });
    await vi.advanceTimersByTimeAsync(3000);
    const refreshed = { ...t.opts, onPredict: vi.fn() };
    expect(t.render(refreshed)).toMatchObject({
      isPredicting: true,
      isPromptEvaluating: true,
      isEvaluating: false,
    });
    prompt.resolve({ decisions: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.render(refreshed)).toMatchObject({
      isPredicting: true,
      isPromptEvaluating: false,
      isEvaluating: false,
    });
    t.pending.resolve(prediction);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.render(refreshed)).toMatchObject({
      isPredicting: false,
      isPromptEvaluating: false,
      isEvaluating: true,
    });
    code.resolve({ decisions: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.render(refreshed)).toMatchObject({
      isPredicting: false,
      isPromptEvaluating: false,
      isEvaluating: false,
    });
  });

  it("suppresses new evaluations while pipeline is in flight, re-triggers after completion", async () => {
    const t = setup();
    const newer = deferred<Corti.CodesGeneralResponse>();
    const onPredict = vi
      .fn()
      .mockReturnValueOnce(t.pending.promise)
      .mockReturnValueOnce(newer.promise);
    const opts = { ...t.opts, onPredict };
    t.render(opts).onCadenceEvent({ type: "edit" });
    await vi.advanceTimersByTimeAsync(3000);
    expect(onPredict).toHaveBeenCalledTimes(1);

    // Text changes while pipeline is in flight — second evaluation is suppressed
    t.editor.current.textContent = "CHF and diabetes";
    t.render(opts).onCadenceEvent({ type: "edit" });
    await vi.advanceTimersByTimeAsync(3000);
    expect(onPredict).toHaveBeenCalledTimes(1);

    // First predict resolves — pipeline completes, code agent skipped (text changed)
    t.pending.resolve(prediction);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.codeAgent).not.toHaveBeenCalled();

    // Re-trigger fires after 3s debounce with the latest text
    await vi.advanceTimersByTimeAsync(3000);
    expect(onPredict).toHaveBeenCalledTimes(2);

    newer.resolve(prediction);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.codeAgent).toHaveBeenCalledTimes(1);
    expect(t.render(opts).isPredicting).toBe(false);
  });

  it("clears prediction status after a failed request", async () => {
    const t = setup();
    const opts = { ...t.opts, onPredict: vi.fn().mockRejectedValue(new Error("offline")) };
    t.render(opts).onCadenceEvent({ type: "edit" });
    await vi.advanceTimersByTimeAsync(3000);
    expect(t.render(opts)).toMatchObject({ isPredicting: false, predictError: "offline" });
  });

  it.each([
    "prompt-first",
    "code-first",
  ])("combines same-snapshot responses in %s order", async (order) => {
    const t = setup();
    const prompt = deferred<EvaluationResponse>();
    const combined = [
      {
        ...t.rules[0],
        trigger: { ...t.rules[0].trigger, prompt: { prompt: "Missing specificity" } },
      },
    ];
    t.promptAgent.mockReturnValue(prompt.promise);
    t.render(t.opts, combined).onCadenceEvent({ type: "edit" });
    await vi.advanceTimersByTimeAsync(3000);
    const promptResult: EvaluationResponse = {
      decisions: [
        {
          id: criterionId(combined[0].id, "trigger", "prompt"),
          outcome: "matched",
          message: "Specify type",
        },
      ],
    };
    if (order === "prompt-first") {
      prompt.resolve(promptResult);
    } else {
      t.pending.resolve(prediction);
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(t.render(t.opts, combined).activeNudges).toHaveLength(0);
    if (order === "prompt-first") {
      t.pending.resolve(prediction);
    } else {
      prompt.resolve(promptResult);
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(t.render(t.opts, combined).activeNudges).toHaveLength(1);
  });

  it("reevaluates rule edits without typing and removes disabled nudges immediately", async () => {
    const t = setup();
    t.render();
    await vi.advanceTimersByTimeAsync(3000);
    t.pending.resolve(prediction);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.render().activeNudges).toHaveLength(1);
    const edited = t.rules.map((r) => ({ ...r, message: "Updated message" }));
    t.render(t.opts, edited);
    await vi.advanceTimersByTimeAsync(3000);
    expect(t.codeAgent).toHaveBeenCalledTimes(2);
    const disabled = edited.map((r) => ({ ...r, enabled: false }));
    t.render(t.opts, disabled);
    expect(t.render(t.opts, disabled).activeNudges).toHaveLength(0);
  });

  it("retains an old nudge as stale after an agent failure", async () => {
    const t = setup();
    t.render();
    await vi.advanceTimersByTimeAsync(3000);
    t.pending.resolve(prediction);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.render().activeNudges).toHaveLength(1);
    t.codeAgent.mockRejectedValue(new Error("offline"));
    t.render().onCadenceEvent({ type: "edit" });
    await vi.advanceTimersByTimeAsync(3000);
    expect(t.render().activeNudges[0].freshness).toBe("stale");
    expect(t.render().agentError).toBe("offline");
  });

  it("retains a prompt-sourced nudge and logs to debug after prompt agent failure", async () => {
    const t = setup();
    t.promptAgent.mockResolvedValueOnce({
      decisions: [
        {
          id: criterionId(CATALOG[9].id, "trigger", "prompt"),
          outcome: "matched",
          message: "Let's get documenting!",
        },
      ],
    });
    t.render().onCadenceEvent({ type: "edit" });
    await vi.advanceTimersByTimeAsync(3000);
    t.pending.resolve(prediction);
    await vi.advanceTimersByTimeAsync(0);
    const firstActive = t.render().activeNudges;
    expect(firstActive.some((n) => n.ruleId === CATALOG[9].id)).toBe(true);
    expect(firstActive.find((n) => n.ruleId === CATALOG[9].id)?.dynamicMessage).toBe(
      "Let's get documenting!",
    );
    t.promptAgent.mockRejectedValue(new Error("prompt offline"));
    t.render().onCadenceEvent({ type: "edit" });
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(0);
    const promptNudge = t.render().activeNudges.find((n) => n.ruleId === CATALOG[9].id);
    expect(promptNudge).toBeDefined();
    expect(promptNudge?.freshness).toBe("stale");
    expect(t.render().promptError).toBe("prompt offline");
    expect(pushDebugEntry).toHaveBeenCalledWith(
      "prompt-response",
      expect.stringContaining("prompt offline"),
    );
  });

  it("does not reschedule cadence during token refresh, agent responses, or idle rerenders", async () => {
    const t = setup();
    const connection = {
      authConfig: { accessToken: "initial" },
      environment: "eu",
      tenantName: "tenant",
      clientId: "client",
      isReady: true,
    };
    const scope = nudgeConnectionState(connection).scope;
    const opts = { ...t.opts, evaluationScope: scope, agentCached: false };
    t.render(opts).onCadenceEvent({ type: "edit" });
    await vi.advanceTimersByTimeAsync(3000);
    const refreshScope = nudgeConnectionState({ ...connection, isReady: false }).scope;
    expect(refreshScope).toBe(scope);
    t.render({ ...opts, evaluationScope: refreshScope });
    const renewedScope = nudgeConnectionState({
      ...connection,
      authConfig: { accessToken: "renewed" },
    }).scope;
    expect(renewedScope).toBe(scope);
    t.render({ ...opts, evaluationScope: renewedScope });
    t.pending.resolve(prediction);
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 30; i++) {
      t.render({ ...opts, evaluationScope: i % 2 ? refreshScope : renewedScope });
      await vi.advanceTimersByTimeAsync(3000);
    }
    expect(t.opts.onPredict).toHaveBeenCalledTimes(1);
    expect(t.promptAgent).toHaveBeenCalledTimes(1);
    expect(t.codeAgent).toHaveBeenCalledTimes(1);
    expect(t.render(opts)).toMatchObject({
      isPredicting: false,
      isEvaluating: false,
      isPromptEvaluating: false,
    });
    expect(nudgeConnectionState({ ...connection, authConfig: { accessToken: "" } }).scope).not.toBe(
      scope,
    );
    expect(nudgeConnectionState({ ...connection, tenantName: "another" }).scope).not.toBe(scope);
  });

  it("does not call either agent or prediction for an empty note", async () => {
    const t = setup();
    t.editor.current.textContent = "   ";
    t.render().onCadenceEvent({ type: "edit" });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(t.opts.onPredict).not.toHaveBeenCalled();
    expect(t.promptAgent).not.toHaveBeenCalled();
    expect(t.codeAgent).not.toHaveBeenCalled();
    expect(t.render().unknownCount).toBe(0);
  });

  it("continues to the code agent after prompt completion and token-refresh callback recreation", async () => {
    const t = setup();
    t.render().onCadenceEvent({ type: "edit" });
    await vi.advanceTimersByTimeAsync(3000);
    expect(t.promptAgent).toHaveBeenCalledTimes(1);
    expect(t.codeAgent).not.toHaveBeenCalled();
    // Same inputs, new objects/functions as with an access-token refresh.
    const refreshed = { ...t.opts, onPredict: vi.fn() };
    t.render(
      refreshed,
      t.rules.map((rule) => ({ ...rule })),
    );
    t.pending.resolve(prediction);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.codeAgent).toHaveBeenCalledTimes(1);
    expect(t.codeAgent.mock.calls[0][0].codes).toEqual(prediction);
    expect(t.render(refreshed).activeNudges.map((n) => n.ruleId)).toContain(
      "chf-specificity-icd10",
    );
    expect(pushDebugEntry).not.toHaveBeenCalledWith("evaluation-discarded", expect.anything());
  });

  it.each([
    "note",
    "scope",
    "rules",
  ])("still discards prediction when %s changes", async (change) => {
    const t = setup();
    t.render().onCadenceEvent({ type: "edit" });
    await vi.advanceTimersByTimeAsync(3000);
    if (change === "note") {
      t.editor.current.textContent = "Patient denies heart failure.";
    }
    if (change === "scope") {
      t.render({ ...t.opts, evaluationScope: "tenant-b" });
    }
    if (change === "rules") {
      t.render(
        t.opts,
        t.rules.map((rule) => ({ ...rule, enabled: false })),
      );
    }
    t.pending.resolve(prediction);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.codeAgent).not.toHaveBeenCalled();
    expect(pushDebugEntry).toHaveBeenCalledWith("evaluation-discarded", expect.any(String));
  });
});

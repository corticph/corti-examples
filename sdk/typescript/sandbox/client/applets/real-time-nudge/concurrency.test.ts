import type { CortiClient } from "@corti/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { codeCriteria } from "./evaluation";
import { CATALOG } from "./nudgeRules";
import { invalidateCache, predictCodes } from "./predictCodes";
import { evaluateCodesWithAgent, evaluatePromptWithAgent } from "./snomedAgent";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const codes = {
  codes: [],
  candidates: [
    {
      system: "icd10cm-outpatient" as const,
      code: "I50.9",
      display: "Heart failure",
    },
  ],
  usageInfo: { creditsConsumed: 0 },
};

function clientWith(send: ReturnType<typeof vi.fn>) {
  return {
    agents: {
      list: vi.fn().mockResolvedValue([
        { id: "code-agent", name: "Nudge Code Evaluator" },
        { id: "prompt-agent", name: "Nudge Prompt Evaluator" },
      ]),
      update: vi.fn().mockResolvedValue({}),
      messageSend: send,
    },
  } as unknown as CortiClient;
}

function predictClient(predict: ReturnType<typeof vi.fn>) {
  return {
    codes: { predict },
  } as unknown as CortiClient;
}

function response(text: string) {
  return { message: { parts: [{ kind: "text", text }] } };
}

afterEach(() => {
  invalidateCache();
});

describe("overlapping nudge requests", () => {
  it.each([
    "code",
    "prompt",
  ] as const)("shares identical in-flight %s evaluations even with caching disabled", async (kind) => {
    const pending = deferred<ReturnType<typeof response>>();
    const send = vi.fn().mockReturnValue(pending.promise);
    const client = clientWith(send);
    const run = () =>
      kind === "code"
        ? evaluateCodesWithAgent(
            client,
            {
              text: "CHF",
              codes,
              criteria: codeCriteria([CATALOG[1]]),
              nudgeState: { triggered: [], resolved: [], dismissed: [] },
            },
            false,
          )
        : evaluatePromptWithAgent(
            client,
            {
              text: "CHF",
              criteria: [{ id: "test:trigger", prompt: "CHF is documented" }],
            },
            false,
          );
    const first = run();
    const second = run();
    expect(first).toBe(second);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    pending.resolve(response('{"decisions":[]}'));
    await Promise.all([first, second]);
    await run();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("releases failed requests so they can be retried", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(response('{"decisions":[{"id":"test","outcome":"not-matched"}]}'));
    const client = clientWith(send);
    const req = { text: "retry", criteria: [{ id: "test", prompt: "test" }] };
    await expect(evaluatePromptWithAgent(client, req, false)).rejects.toThrow("offline");
    await expect(evaluatePromptWithAgent(client, req, false)).resolves.toEqual({
      decisions: [{ id: "test", outcome: "not-matched" }],
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("shares identical predictions but keeps changed note text separate", async () => {
    const first = deferred<typeof codes>();
    const second = deferred<typeof codes>();
    const predictMock = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const client = predictClient(predictMock);
    const req = {
      text: "CHF",
      client,
    };
    const a = predictCodes(req);
    const b = predictCodes(req);
    const c = predictCodes({ ...req, text: "patient denies CHF" });
    await vi.waitFor(() => expect(predictMock).toHaveBeenCalledTimes(1));
    first.resolve(codes);
    expect(await a).toEqual(codes);
    expect(await b).toEqual(codes);
    await vi.waitFor(() => expect(predictMock).toHaveBeenCalledTimes(2));
    const empty = { ...codes, candidates: [] };
    second.resolve(empty);
    expect(await c).toEqual(empty);
  });
  it("aborts an obsolete prediction and starts the latest note", async () => {
    const latest = deferred<typeof codes>();
    const predictMock = vi
      .fn()
      .mockImplementationOnce(
        (_request: unknown, options: { abortSignal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.abortSignal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      )
      .mockReturnValueOnce(latest.promise);
    const client = predictClient(predictMock);
    const req = {
      text: "CHF",
      client,
      scope: "abort-test",
    };
    const old = expect(predictCodes(req)).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(predictMock).toHaveBeenCalledTimes(1));
    const current = predictCodes({ ...req, text: "No CHF" });
    await old;
    await vi.waitFor(() => expect(predictMock).toHaveBeenCalledTimes(2));
    latest.resolve(codes);
    expect(await current).toEqual(codes);
  });
});

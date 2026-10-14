import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestStage, SupersededRequest } from "./requestStage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => vi.useRealTimers());
describe("request stage", () => {
  it("shares active work, bounds concurrency, and retains only the latest queued input", async () => {
    const stage = new RequestStage<number>();
    const first = deferred<number>();
    const work = vi.fn().mockReturnValue(first.promise);
    const a = stage.run("a", work);
    expect(stage.run("a", work)).toBe(a);
    const skip = vi.fn();
    const b = stage.run("b", skip);
    const rejected = expect(b).rejects.toBeInstanceOf(SupersededRequest);
    const latest = vi.fn().mockResolvedValue(3);
    const c = stage.run("c", latest);
    await rejected;
    expect(skip).not.toHaveBeenCalled();
    expect(latest).not.toHaveBeenCalled();
    first.resolve(1);
    expect(await a).toBe(1);
    expect(await c).toBe(3);
    expect(work).toHaveBeenCalledTimes(1);
  });
  it("drops queued work when the latest input returns to the active request", async () => {
    const stage = new RequestStage<number>();
    const pending = deferred<number>();
    const first = stage.run("a", () => pending.promise);
    const skipped = vi.fn();
    const queued = stage.run("b", skipped);
    const rejected = expect(queued).rejects.toBeInstanceOf(SupersededRequest);
    expect(stage.run("a", () => Promise.resolve(2))).toBe(first);
    await rejected;
    pending.resolve(1);
    await first;
    expect(skipped).not.toHaveBeenCalled();
  });

  it("expires entries and evicts the least recently used entry", async () => {
    vi.useFakeTimers();
    const stage = new RequestStage<number>(
      () => {},
      () => true,
      1000,
      2,
    );
    const work = vi.fn().mockResolvedValue(1);
    await stage.run("a", work);
    await stage.run("b", work);
    await stage.run("a", work);
    await stage.run("c", work);
    await stage.run("b", work);
    expect(work).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(1001);
    await stage.run("b", work);
    expect(work).toHaveBeenCalledTimes(5);
  });
  it("invalidation rejects old completions and prevents cache repopulation", async () => {
    const stage = new RequestStage<number>();
    const pending = deferred<number>();
    const a = stage.run("a", () => pending.promise);
    const rejected = expect(a).rejects.toBeInstanceOf(SupersededRequest);
    stage.invalidate();
    pending.resolve(1);
    await rejected;
    const work = vi.fn().mockResolvedValue(2);
    expect(await stage.run("a", work)).toBe(2);
    expect(work).toHaveBeenCalledTimes(1);
  });
  it("does not cache failures, unknown results, or cache-disabled calls", async () => {
    const stage = new RequestStage<string>(
      () => {},
      (value) => value !== "unknown",
    );
    const work = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("unknown")
      .mockResolvedValue("matched");
    await expect(stage.run("a", work)).rejects.toThrow("offline");
    await stage.run("a", work);
    await stage.run("a", work, false);
    await stage.run("a", work);
    expect(work).toHaveBeenCalledTimes(4);
    await stage.run("a", work);
    expect(work).toHaveBeenCalledTimes(4);
  });
});

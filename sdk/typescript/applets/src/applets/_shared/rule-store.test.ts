import { describe, expect, it } from "vitest";
import { createRuleStore, type RuleBase } from "./rule-store";

interface Item extends RuleBase {
  value: string;
}

// localStorage is undefined in the node test env, so ConfigStore reads/writes are
// no-ops — this exercises the in-memory catalog + mutation logic.
const fresh = () =>
  createRuleStore<Item>("test.items", [
    { id: "a", value: "alpha", builtin: true },
    { id: "b", value: "beta", builtin: true },
  ]);

describe("createRuleStore", () => {
  it("seeds from the catalog", () => {
    expect(
      fresh()
        .getItems()
        .map((i) => i.id),
    ).toEqual(["a", "b"]);
  });

  it("upsert adds then updates by id", () => {
    const store = fresh();
    store.upsert({ id: "c", value: "gamma" });
    expect(store.getItems().map((i) => i.id)).toEqual(["a", "b", "c"]);
    store.upsert({ id: "c", value: "gamma2" });
    const matches = store.getItems().filter((i) => i.id === "c");
    expect(matches).toHaveLength(1);
    expect(matches[0].value).toBe("gamma2");
  });

  it("removeMany deletes custom items but protects builtins", () => {
    const store = fresh();
    store.upsert({ id: "c", value: "gamma" });
    store.removeMany(["a", "c"]); // 'a' builtin → kept; 'c' custom → removed
    expect(store.getItems().map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("generates unique ids", () => {
    const store = fresh();
    expect(store.newId()).not.toBe(store.newId());
  });
});

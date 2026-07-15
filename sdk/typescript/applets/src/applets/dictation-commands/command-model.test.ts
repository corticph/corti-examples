import { describe, it, expect } from "vitest";
import { toTranscribeCommands, type ManagedCommand } from "./command-model";

const base = (over: Partial<ManagedCommand>): ManagedCommand => ({
  id: "c",
  phrases: ["do it"],
  action: { kind: "noop" },
  ...over,
});

describe("toTranscribeCommands", () => {
  it("strips the client-side action from the API config", () => {
    const [out] = toTranscribeCommands([
      base({ action: { kind: "delete_last" } }),
    ]);
    expect(out).toEqual({ id: "c", phrases: ["do it"], variables: undefined });
    expect("action" in out).toBe(false);
  });

  it("passes enum variables through with their values", () => {
    const [out] = toTranscribeCommands([
      base({
        variables: [{ key: "style", type: "enum", enum: ["bold", "italic"] }],
      }),
    ]);
    expect(out.variables).toEqual([
      { key: "style", type: "enum", enum: ["bold", "italic"] },
    ]);
  });

  it("emits wildcard variables without an enum field (shim)", () => {
    const [out] = toTranscribeCommands([
      base({ variables: [{ key: "utterance", type: "wildcard" }] }),
    ]);
    expect(out.variables).toEqual([{ key: "utterance", type: "wildcard" }]);
  });
});

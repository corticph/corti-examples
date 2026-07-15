import { describe, expect, it } from "vitest";
import { buildConversationalConfig } from "./config";

describe("buildConversationalConfig", () => {
  it("registers the wake command and Corti keyterm biasing", () => {
    const config = buildConversationalConfig("en");

    expect(config.interimResults).toBe(false);
    expect(config.terms).toEqual([{ term: "Corti" }]);
    expect(config.keyterms).toEqual({ terms: [{ term: "Corti" }] });
    expect(config.commands).toHaveLength(1);
    expect(config.commands?.[0]).toMatchObject({
      id: "conversational_agent_wake",
      phrases: [
        "ok Corti {intent}",
        "okay Corti {intent}",
        "hey Corti {intent}",
        "Corti {intent}",
      ],
    });
  });
});

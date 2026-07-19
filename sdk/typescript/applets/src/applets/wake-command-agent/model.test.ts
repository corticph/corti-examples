import { describe, expect, it } from "vitest";
import { clearConversationState, extractWakeIntent } from "./model";

describe("extractWakeIntent", () => {
  it("prefers the wildcard variable when present", () => {
    expect(
      extractWakeIntent({
        variables: { intent: "summarize the assessment" },
        rawTranscriptText: "okay Corti summarize the assessment",
      }),
    ).toBe("summarize the assessment");
  });

  it("falls back to raw transcript parsing when variables are missing", () => {
    expect(
      extractWakeIntent({
        variables: null,
        rawTranscriptText: "hey Corti review the medication list",
      }),
    ).toBe("review the medication list");
  });
});

describe("clearConversationState", () => {
  it("clears thread-specific data while preserving other fields", () => {
    const cleared = clearConversationState({
      composer: "draft",
      contextId: "ctx-123",
      error: "boom",
      messages: [
        {
          id: "1",
          role: "user" as const,
          source: "typed" as const,
          text: "hello",
          at: 1,
        },
      ],
      debugLog: [
        {
          id: "d1",
          type: "command" as const,
          text: "okay Corti hello",
          at: 1,
        },
      ],
      prompt: "keep me",
      autoSend: true,
      status: "ready" as const,
    });

    expect(cleared).toMatchObject({
      composer: "",
      contextId: null,
      error: undefined,
      messages: [],
      debugLog: [],
      prompt: "keep me",
      autoSend: true,
      status: "ready",
    });
  });
});

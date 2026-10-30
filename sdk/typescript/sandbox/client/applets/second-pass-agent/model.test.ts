import { describe, expect, it } from "vitest";
import { flattenTranscriptForAgent } from "./model";

describe("Second-pass agent-input flattening", () => {
  const transcript = {
    id: "transcript-1",
    metadata: {},
    transcripts: [
      { speakerId: 1, text: " Hello   there " },
      { speakerId: 2, text: "general   kenobi" },
      { channel: 7, text: " " },
      { channel: 3, text: "\nstatus is stable\n" },
      { text: "no label" },
    ],
    recordingId: "recording-1",
    status: "completed" as const,
  };

  it("flattens transcript segments for the agent with speaker labels", () => {
    expect(flattenTranscriptForAgent(transcript)).toBe(
      [
        "Speaker 1: Hello there",
        "Speaker 2: general kenobi",
        "Channel 3: status is stable",
        "no label",
      ].join("\n"),
    );
  });

  it("falls back to channel labels when speaker ids are absent", () => {
    expect(
      flattenTranscriptForAgent({
        transcripts: [{ channel: 9, text: "follow up" }],
      }),
    ).toBe("Channel 9: follow up");
  });

  it("ignores empty transcript segments", () => {
    expect(
      flattenTranscriptForAgent({
        transcripts: [{ text: "  " }, { text: "\n" }],
      }),
    ).toBe("");
  });
});

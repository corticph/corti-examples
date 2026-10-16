import { describe, expect, it } from "vitest";
import {
  buildTranscriptJsonFilename,
  createEmptyRunState,
  flattenTranscriptForDisplay,
  resetRunStateForNewRun,
  resolveTranscriptIdFromCreateResponse,
} from "./model";

describe("transcript display flattening", () => {
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

  it("flattens transcript segments for display as one unlabeled string", () => {
    expect(flattenTranscriptForDisplay(transcript)).toBe(
      "Hello there general kenobi status is stable no label",
    );
  });

  it("ignores empty transcript segments", () => {
    expect(
      flattenTranscriptForDisplay({
        transcripts: [{ text: "  " }, { text: "\n" }],
      }),
    ).toBe("");
  });
});

describe("transcript create-response parsing", () => {
  it("reads the transcript id from a completed create response body", () => {
    expect(resolveTranscriptIdFromCreateResponse({ id: "abc-123" })).toBe("abc-123");
  });

  it("reads the transcript id from an async location header", () => {
    expect(
      resolveTranscriptIdFromCreateResponse(
        {},
        "https://api.example.test/v2/interactions/i/transcripts/def-456/status",
      ),
    ).toBe("def-456");
  });

  it("throws when neither the body nor the location identifies a transcript", () => {
    expect(() => resolveTranscriptIdFromCreateResponse({}, null)).toThrow(
      /did not include a transcript id/i,
    );
  });
});

describe("run-state helpers", () => {
  it("clears stale transcript output on rerun", () => {
    expect(resetRunStateForNewRun("creating_transcript")).toEqual({
      ...createEmptyRunState(),
      phase: "creating_transcript",
    });
  });

  it("builds a transcript download filename with the default prefix", () => {
    expect(buildTranscriptJsonFilename("abc")).toBe("corti-transcript-abc.json");
  });

  it("namespaces the download filename with a custom prefix", () => {
    expect(buildTranscriptJsonFilename("abc", "corti-second-pass-transcript")).toBe(
      "corti-second-pass-transcript-abc.json",
    );
  });
});

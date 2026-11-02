import { describe, expect, it } from "vitest";
import { normalizeTranscriptMessageData } from "./transcriptMessage";

/** Word-level final batch, from the API reference example. */
const BATCHED_FINALS = [
  { text: "patient", rawTranscriptText: "patient", start: 0.0, end: 0.4, isFinal: true },
  { text: "reports", rawTranscriptText: "reports", start: 0.5, end: 0.8, isFinal: true },
  { text: "mild", rawTranscriptText: "mild", start: 0.9, end: 1.2, isFinal: true },
  { text: "chest", rawTranscriptText: "chest", start: 1.3, end: 1.6, isFinal: true },
  { text: "pain", rawTranscriptText: "pain", start: 1.7, end: 2.4, isFinal: true },
];

describe("normalizeTranscriptMessageData", () => {
  it("returns a final batch for a word-level final list, preserving spoken order", () => {
    const batch = normalizeTranscriptMessageData(BATCHED_FINALS);
    expect(batch).toEqual({ kind: "final", items: BATCHED_FINALS });
  });

  it("returns an interim preview for a one-element list with a non-final item", () => {
    const data = [
      {
        text: "patient reports mild chest",
        rawTranscriptText: "patient reports mild chest",
        start: 0.0,
        end: 1.6,
        isFinal: false,
      },
    ];
    expect(normalizeTranscriptMessageData(data)).toEqual({
      kind: "interim",
      text: "patient reports mild chest",
    });
  });

  it("keeps items without timing — start and end are optional fields", () => {
    const data = [{ text: "untimed", isFinal: true }];
    expect(normalizeTranscriptMessageData(data)).toEqual({
      kind: "final",
      items: [{ text: "untimed", isFinal: true }],
    });
  });

  it("returns a one-item final batch for a single final segment (wordLevel off)", () => {
    const data = {
      text: "patient reports mild chest pain.",
      rawTranscriptText: "patient reports mild chest pain period",
      start: 0.0,
      end: 3.2,
      isFinal: true,
    };
    expect(normalizeTranscriptMessageData(data)).toEqual({
      kind: "final",
      items: [data],
    });
  });

  it("returns an interim preview for a single non-final segment (wordLevel off)", () => {
    const data = { text: "patient reports", start: 0.0, end: 1.1, isFinal: false };
    expect(normalizeTranscriptMessageData(data)).toEqual({
      kind: "interim",
      text: "patient reports",
    });
  });

  it("drops stray non-final and malformed items from a final list", () => {
    const data = [
      { text: "final", start: 0.0, end: 0.4, isFinal: true },
      { text: "preview", start: 0.5, end: 0.6, isFinal: false },
      "not an item",
      null,
    ];
    expect(normalizeTranscriptMessageData(data)).toEqual({
      kind: "final",
      items: [{ text: "final", start: 0.0, end: 0.4, isFinal: true }],
    });
  });

  it("ignores empty lists and lists without usable items", () => {
    expect(normalizeTranscriptMessageData([])).toEqual({ kind: "ignore" });
    expect(normalizeTranscriptMessageData(["nope", 42])).toEqual({ kind: "ignore" });
    expect(
      normalizeTranscriptMessageData([
        { text: "a", isFinal: false },
        { text: "b", isFinal: false },
      ]),
    ).toEqual({ kind: "ignore" });
  });

  it("ignores payloads that are not transcript items", () => {
    expect(normalizeTranscriptMessageData(undefined)).toEqual({ kind: "ignore" });
    expect(normalizeTranscriptMessageData(null)).toEqual({ kind: "ignore" });
    expect(normalizeTranscriptMessageData("transcript")).toEqual({ kind: "ignore" });
    expect(normalizeTranscriptMessageData({ isFinal: true })).toEqual({ kind: "ignore" });
  });
});

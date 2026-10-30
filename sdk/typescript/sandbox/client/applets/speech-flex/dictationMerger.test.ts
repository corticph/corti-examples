import { describe, expect, it } from "vitest";
import { findMissingSentences, parseMerge } from "./dictationMerger";

describe("findMissingSentences", () => {
  it("returns nothing when every dictated sentence is present", () => {
    expect(
      findMissingSentences(
        "Patient has chest pain. Vitals normal.",
        "Patient has chest pain. Vitals normal. See you next week.",
      ),
    ).toEqual([]);
  });

  it("matches verbatim ignoring case and whitespace", () => {
    expect(findMissingSentences("Patient has   chest pain.", "PATIENT has chest pain.")).toEqual(
      [],
    );
  });

  it("allows AI content to be woven around intact dictated sentences", () => {
    expect(
      findMissingSentences(
        "Start metformin. Review in 3 weeks.",
        "Note the plan below. Start metformin. Review in 3 weeks. Discharge home.",
      ),
    ).toEqual([]);
  });

  it("returns only the missing sentences", () => {
    expect(
      findMissingSentences(
        "Intact sentence. Dropped sentence.",
        "Intact sentence. Extra AI content.",
      ),
    ).toEqual(["Dropped sentence."]);
  });

  it("flags rephrased dictated text as missing", () => {
    expect(
      findMissingSentences("Start metformin 500 mg.", "We will begin metformin at a low dose."),
    ).toEqual(["Start metformin 500 mg."]);
  });

  it("treats terminator-less dictated text as one fragment", () => {
    expect(findMissingSentences("no terminator here", "prefix no terminator here suffix")).toEqual(
      [],
    );
  });

  it("returns an empty array for empty dictation", () => {
    expect(findMissingSentences("", "anything")).toEqual([]);
  });
});

describe("parseMerge", () => {
  it("parses plain JSON", () => {
    expect(parseMerge('{"S1": "merged text"}', ["S1"]).get("S1")).toBe("merged text");
  });

  it("extracts JSON from markdown fences", () => {
    expect(parseMerge('```json\n{"S2": "in fence"}\n```', ["S2"]).get("S2")).toBe("in fence");
  });

  it("only keeps non-empty string values for requested tokens", () => {
    const out = parseMerge('{"S1": "one", "S2": "", "S3": 12, "S9": "x"}', ["S1", "S2", "S3"]);
    expect([...out.entries()]).toEqual([["S1", "one"]]);
  });

  it("throws when the response contains no JSON object", () => {
    expect(() => parseMerge("not json", ["S1"])).toThrow("Agent did not return a JSON object.");
  });
});

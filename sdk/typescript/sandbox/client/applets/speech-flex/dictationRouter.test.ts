import { describe, expect, it } from "vitest";
import { parseRouting, splitSentences } from "./dictationRouter";

describe("splitSentences", () => {
  it("returns an empty array for blank input", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   \n\t ")).toEqual([]);
  });

  it("splits on sentence terminators", () => {
    expect(splitSentences("History of chest pain. Exam was normal! Plan is rest?")).toEqual([
      "History of chest pain.",
      "Exam was normal!",
      "Plan is rest?",
    ]);
  });

  it("does not split when the next sentence starts lowercase", () => {
    expect(splitSentences("he said stop. and then left")).toEqual(["he said stop. and then left"]);
  });

  it("splits before digits and quotes", () => {
    expect(splitSentences('Vitals checked. 2 mg given. "Come back soon."')).toEqual([
      "Vitals checked.",
      "2 mg given.",
      '"Come back soon."',
    ]);
  });

  it("always splits on newlines", () => {
    expect(splitSentences("first line. still same chunk\nsecond line. more text")).toEqual([
      "first line. still same chunk",
      "second line. more text",
    ]);
    expect(splitSentences("A.\n\n\nB")).toEqual(["A.", "B"]);
  });

  it("keeps verbatim text through title abbreviations", () => {
    expect(splitSentences("Mrs. Smith has pain. She saw Dr. Jones.")).toEqual([
      "Mrs. Smith has pain.",
      "She saw Dr. Jones.",
    ]);
  });

  it("does not split inside a unit abbreviation", () => {
    // Documented trade-off: "mg." is protected, its dot disappears before the
    // split pass, so the whole dictation stays one coarse chunk — still verbatim.
    expect(splitSentences("Given 500 mg. Patient tolerated it.")).toEqual([
      "Given 500 mg. Patient tolerated it.",
    ]);
  });

  it("does not split a sentence starting with an abbreviated title", () => {
    // The protected "Pt." placeholder is not an uppercase letter, so no false
    // split happens before it — the visit note reads as one chunk.
    expect(splitSentences("Seen in clinic. Pt. reports pain.")).toEqual([
      "Seen in clinic. Pt. reports pain.",
    ]);
  });

  it("trims and drops blank chunks", () => {
    expect(splitSentences("  Hello.  ")).toEqual(["Hello."]);
    expect(splitSentences(" a. \n  \n b. ")).toEqual(["a.", "b."]);
  });
});

describe("parseRouting", () => {
  it("parses a plain JSON object", () => {
    const out = parseRouting('{"S1": [1, 3], "S2": [5]}', ["S1", "S2"]);
    expect(out.get("S1")).toEqual([1, 3]);
    expect(out.get("S2")).toEqual([5]);
  });

  it("extracts JSON from markdown fences and surrounding prose", () => {
    expect(parseRouting('```json\n{"S1": [2]}\n```', ["S1"]).get("S1")).toEqual([2]);
    expect(parseRouting('Here you go: {"S1": [1]} hope this helps', ["S1"]).get("S1")).toEqual([1]);
  });

  it("tolerates string-form index lists", () => {
    expect(parseRouting('{"S1": "1, 3"}', ["S1"]).get("S1")).toEqual([1, 3]);
    expect(parseRouting('{"S1": "1 3"}', ["S1"]).get("S1")).toEqual([1, 3]);
  });

  it("filters non-numeric members out of string-form lists", () => {
    expect(parseRouting('{"S1": "1, x, 3"}', ["S1"]).get("S1")).toEqual([1, 3]);
  });

  it("skips whitespace-only string values", () => {
    expect(parseRouting('{"S1": "  "}', ["S1"]).has("S1")).toBe(false);
  });

  it("only keeps requested tokens", () => {
    const out = parseRouting('{"S9": [1], "S1": [2]}', ["S1"]);
    expect([...out.keys()]).toEqual(["S1"]);
  });

  it("rejects arrays with non-numeric members", () => {
    expect(parseRouting('{"S1": [1, "x"]}', ["S1"]).has("S1")).toBe(false);
  });

  it("ignores values that are neither arrays nor non-empty strings", () => {
    const out = parseRouting('{"S1": 5, "S2": null}', ["S1", "S2"]);
    expect(out.has("S1")).toBe(false);
    expect(out.has("S2")).toBe(false);
  });

  it("keeps an explicitly empty index array", () => {
    expect(parseRouting('{"S1": []}', ["S1"]).get("S1")).toEqual([]);
  });

  it("throws when the response contains no JSON object", () => {
    expect(() => parseRouting("no json here", ["S1"])).toThrow(
      "Agent did not return a JSON object.",
    );
  });
});

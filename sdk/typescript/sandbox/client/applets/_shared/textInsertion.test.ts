import { describe, expect, it } from "vitest";
import {
  buildInsertion,
  capitalizeForContext,
  getLeadingSeparator,
  spliceSegment,
} from "./textInsertion";

const NBSP = "\u00A0";

describe("getLeadingSeparator", () => {
  it("adds a space between words", () => {
    expect(getLeadingSeparator("n", "P")).toBe(" ");
  });
  it("adds no leading space at the start of the field", () => {
    expect(getLeadingSeparator(null, "P")).toBe("");
  });
  it("does not add a space after an opening bracket/quote", () => {
    expect(getLeadingSeparator("(", "m")).toBe("");
    expect(getLeadingSeparator('"', "m")).toBe("");
  });
  it("does not add a space before left-attaching punctuation", () => {
    for (const p of [",", ".", ":", ";", "!", "?", ")", "%"]) {
      expect(getLeadingSeparator("n", p)).toBe("");
    }
  });
  it("does not double up when already separated", () => {
    expect(getLeadingSeparator(" ", "P")).toBe("");
    expect(getLeadingSeparator("\n", "P")).toBe("");
  });
  it("uses a non-breaking space before French punctuation", () => {
    expect(getLeadingSeparator("r", "!", "fr")).toBe(NBSP);
    expect(getLeadingSeparator("r", ":", "fr-FR")).toBe(NBSP);
  });
  it("does not apply the French rule to Swiss French", () => {
    expect(getLeadingSeparator("r", "!", "fr-CH")).toBe("");
  });
});

describe("capitalizeForContext", () => {
  it("capitalizes at the start of the field", () => {
    expect(capitalizeForContext("", "patient")).toBe("Patient");
  });
  it("capitalizes after sentence-ending punctuation", () => {
    expect(capitalizeForContext("pain.", "patient")).toBe("Patient");
  });
  it("leaves mid-sentence words unchanged", () => {
    expect(capitalizeForContext("the patient has", "pain")).toBe("pain");
  });
});

describe("buildInsertion", () => {
  it("produces 'pain. Patient' across a sentence boundary", () => {
    expect(buildInsertion("pain.", 5, "patient")).toBe(" Patient");
  });
  it("has no leading space at the start", () => {
    expect(buildInsertion("", 0, "patient")).toBe("Patient");
  });
  it("hugs left-attaching punctuation", () => {
    expect(buildInsertion("pain", 4, ",")).toBe(",");
  });
  it("can disable casing (e.g. automaticPunctuation on)", () => {
    expect(buildInsertion("", 0, "patient", { capitalize: false })).toBe("patient");
  });
  it("returns empty for an empty segment", () => {
    expect(buildInsertion("abc", 3, "")).toBe("");
  });
});

describe("spliceSegment", () => {
  it("appends with correct spacing and reports the new cursor", () => {
    const r = spliceSegment("pain.", 5, 5, "patient");
    expect(r.text).toBe("pain. Patient");
    expect(r.cursor).toBe("pain. Patient".length);
  });
  it("replaces a selection (select-then-dictate)", () => {
    // Selection covers "patient" (indices 4..11) in "the patient".
    const r = spliceSegment("the patient", 4, 11, "doctor");
    expect(r.text).toBe("the doctor");
  });
  it("interim→final: committing replaces nothing extra", () => {
    let doc = spliceSegment("", 0, 0, "hello");
    expect(doc.text).toBe("Hello");
    doc = spliceSegment(doc.text, doc.cursor, doc.cursor, "world");
    expect(doc.text).toBe("Hello world");
  });
});

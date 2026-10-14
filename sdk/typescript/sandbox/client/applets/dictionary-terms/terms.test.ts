import { describe, expect, it } from "vitest";
import { buildTermsConfig, type Term, toExport } from "./terms";

const items: Term[] = [
  { id: "t-Corti", term: "Corti" },
  { id: "t-HbA1c", term: "HbA1c" },
];

describe("dictionary-terms config shape", () => {
  it("exports the same terms and keyterms payload used by the tester UI", () => {
    expect(toExport(items)).toEqual({
      type: "config",
      configuration: {
        terms: [{ term: "Corti" }, { term: "HbA1c" }],
        keyterms: {
          terms: [{ term: "Corti" }, { term: "HbA1c" }],
        },
      },
    });
  });

  it("builds dictation config with mirrored terms and keyterms", () => {
    expect(buildTermsConfig("en", items)).toMatchObject({
      primaryLanguage: "en",
      interimResults: true,
      spokenPunctuation: true,
      audioEvents: { enabled: true },
      terms: [{ term: "Corti" }, { term: "HbA1c" }],
      keyterms: {
        terms: [{ term: "Corti" }, { term: "HbA1c" }],
      },
    });
  });
});

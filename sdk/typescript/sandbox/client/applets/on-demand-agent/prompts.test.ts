import { describe, expect, it } from "vitest";
import {
  type CleanupPrompt,
  DEFAULT_PROMPT,
  isCatalogPrompt,
  languageMatches,
  mergeWithCatalog,
  promptOrigin,
  resolveActivePrompt,
  toExport,
} from "./prompts";

const BUILTIN_ID = "builtin:minimal-en";

const prompt = (
  id: string,
  language: string,
  extra: Partial<CleanupPrompt> = {},
): CleanupPrompt => ({
  id,
  title: `Prompt ${id}`,
  language,
  prompt: `system prompt ${id}`,
  ...extra,
});

describe("languageMatches", () => {
  it("matches identical tags", () => {
    expect(languageMatches("da", "da")).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(languageMatches(" EN ", "en")).toBe(true);
  });

  it("matches across region subtags in both directions", () => {
    expect(languageMatches("en", "en-US")).toBe(true);
    expect(languageMatches("en-GB", "en")).toBe(true);
    expect(languageMatches("en-GB", "en-US")).toBe(true);
  });

  it("treats underscore-separated tags like hyphenated ones", () => {
    expect(languageMatches("en_US", "en")).toBe(true);
  });

  it("does not match different languages", () => {
    expect(languageMatches("da", "de")).toBe(false);
  });

  it("never matches an empty tag", () => {
    expect(languageMatches("", "en")).toBe(false);
    expect(languageMatches("en", "")).toBe(false);
  });
});

describe("resolveActivePrompt", () => {
  const library = [prompt("en", "en", { builtin: true }), prompt("da", "da"), prompt("de", "de")];

  it("picks the prompt matching the dictation language", () => {
    const active = resolveActivePrompt(library, "da", null);
    expect(active.prompt?.id).toBe("da");
    expect(active.reason).toBe("language");
  });

  it("prefers an exact tag match over a base-subtag match", () => {
    const withRegion = [prompt("generic", "en"), prompt("us", "en-US")];
    expect(resolveActivePrompt(withRegion, "en-US", null).prompt?.id).toBe("us");
  });

  it("falls back to a base-subtag match when no exact tag exists", () => {
    const active = resolveActivePrompt(library, "en-US", null);
    expect(active.prompt?.id).toBe("en");
    expect(active.reason).toBe("language");
  });

  it("honours a pin over the dictation language", () => {
    const active = resolveActivePrompt(library, "da", "de");
    expect(active.prompt?.id).toBe("de");
    expect(active.reason).toBe("pinned");
  });

  it("ignores a pin pointing at a prompt that no longer exists", () => {
    const active = resolveActivePrompt(library, "da", "deleted");
    expect(active.prompt?.id).toBe("da");
    expect(active.reason).toBe("language");
  });

  it("falls back to the built-in when the language has no prompt", () => {
    const active = resolveActivePrompt(library, "sv", null);
    expect(active.prompt?.id).toBe("en");
    expect(active.reason).toBe("fallback");
  });

  it("falls back to the first entry when nothing is built in", () => {
    const custom = [prompt("da", "da"), prompt("de", "de")];
    const active = resolveActivePrompt(custom, "sv", null);
    expect(active.prompt?.id).toBe("da");
    expect(active.reason).toBe("fallback");
  });

  it("reports an empty library rather than inventing a prompt", () => {
    const active = resolveActivePrompt([], "en", null);
    expect(active.prompt).toBeNull();
    expect(active.reason).toBe("empty");
  });
});

describe("mergeWithCatalog", () => {
  it("returns the built-in when the user has saved nothing", () => {
    const merged = mergeWithCatalog([]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(BUILTIN_ID);
    expect(merged[0].builtin).toBe(true);
    expect(merged[0].prompt).toBe(DEFAULT_PROMPT);
  });

  it("lets a saved entry override the built-in of the same id", () => {
    const edited = prompt(BUILTIN_ID, "en", {
      title: "My copy edit",
      prompt: "edited body",
    });
    const merged = mergeWithCatalog([edited]);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("My copy edit");
    expect(merged[0].prompt).toBe("edited body");
  });

  it("keeps the overridden entry in its catalog position", () => {
    const merged = mergeWithCatalog([
      prompt("custom", "da"),
      prompt(BUILTIN_ID, "en", { title: "Edited" }),
    ]);
    expect(merged.map((p) => p.id)).toEqual([BUILTIN_ID, "custom"]);
  });

  it("appends the user's own prompts in stored order", () => {
    const merged = mergeWithCatalog([prompt("a", "da"), prompt("b", "de")]);
    expect(merged.map((p) => p.id)).toEqual([BUILTIN_ID, "a", "b"]);
  });

  it("never duplicates an id", () => {
    const merged = mergeWithCatalog([prompt(BUILTIN_ID, "en")]);
    expect(new Set(merged.map((p) => p.id)).size).toBe(merged.length);
  });
});

describe("promptOrigin", () => {
  it("reports an untouched catalog entry as built-in", () => {
    expect(promptOrigin(mergeWithCatalog([])[0])).toBe("builtin");
  });

  it("reports a saved override of a catalog id as edited", () => {
    expect(promptOrigin(prompt(BUILTIN_ID, "en"))).toBe("edited");
  });

  it("reports a user's own prompt as custom", () => {
    expect(promptOrigin(prompt("mine", "da"))).toBe("custom");
  });
});

describe("isCatalogPrompt", () => {
  it("recognises catalog ids", () => {
    expect(isCatalogPrompt(BUILTIN_ID)).toBe(true);
    expect(isCatalogPrompt("mine")).toBe(false);
  });
});

describe("toExport", () => {
  it("exports the prompt content without internal ids or builtin flags", () => {
    expect(toExport([prompt("en", "en", { builtin: true })])).toEqual({
      prompts: [{ title: "Prompt en", language: "en", prompt: "system prompt en" }],
    });
  });
});

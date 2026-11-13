import { describe, expect, it } from "vitest";
import {
  type CleanupPrompt,
  DEFAULT_PROMPT,
  isCatalogPrompt,
  mergeWithCatalog,
  promptOrigin,
  resolveSelectedPrompt,
  toExport,
} from "./prompts";

const BUILTIN_ID = "builtin:minimal-en";
const SUMMARY_ID = "builtin:summary-list-en";

const prompt = (
  id: string,
  language: string,
  extra: Partial<CleanupPrompt> = {},
): CleanupPrompt => ({
  id,
  title: `Prompt ${id}`,
  language,
  prompt: `system prompt ${id}`,
  commandPhrase: "copy edit",
  ...extra,
});

describe("resolveSelectedPrompt", () => {
  const library = [prompt("en", "en", { builtin: true }), prompt("da", "da"), prompt("de", "de")];

  it("returns the prompt matching the selected id", () => {
    expect(resolveSelectedPrompt(library, "da")?.id).toBe("da");
  });

  it("falls back to the first entry when the id is not found", () => {
    expect(resolveSelectedPrompt(library, "deleted")?.id).toBe("en");
  });

  it("falls back to the first entry when the id is empty", () => {
    expect(resolveSelectedPrompt(library, "")?.id).toBe("en");
  });

  it("returns null for an empty library", () => {
    expect(resolveSelectedPrompt([], "")).toBeNull();
  });
});

describe("mergeWithCatalog", () => {
  it("returns the built-ins when the user has saved nothing", () => {
    const merged = mergeWithCatalog([]);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe(BUILTIN_ID);
    expect(merged[0].builtin).toBe(true);
    expect(merged[0].prompt).toBe(DEFAULT_PROMPT);
    expect(merged[1].id).toBe(SUMMARY_ID);
    expect(merged[1].builtin).toBe(true);
  });

  it("lets a saved entry override the built-in of the same id", () => {
    const edited = prompt(BUILTIN_ID, "en", {
      title: "My copy edit",
      prompt: "edited body",
    });
    const merged = mergeWithCatalog([edited]);
    expect(merged).toHaveLength(2);
    expect(merged[0].title).toBe("My copy edit");
    expect(merged[0].prompt).toBe("edited body");
  });

  it("keeps the overridden entry in its catalog position", () => {
    const merged = mergeWithCatalog([
      prompt("custom", "da"),
      prompt(BUILTIN_ID, "en", { title: "Edited" }),
    ]);
    expect(merged.map((p) => p.id)).toEqual([BUILTIN_ID, SUMMARY_ID, "custom"]);
  });

  it("appends the user's own prompts in stored order", () => {
    const merged = mergeWithCatalog([prompt("a", "da"), prompt("b", "de")]);
    expect(merged.map((p) => p.id)).toEqual([BUILTIN_ID, SUMMARY_ID, "a", "b"]);
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
    expect(isCatalogPrompt(SUMMARY_ID)).toBe(true);
    expect(isCatalogPrompt("mine")).toBe(false);
  });
});

describe("toExport", () => {
  it("exports the prompt content without internal ids or builtin flags", () => {
    expect(toExport([prompt("en", "en", { builtin: true })])).toEqual({
      prompts: [
        {
          title: "Prompt en",
          language: "en",
          prompt: "system prompt en",
          commandPhrase: "copy edit",
        },
      ],
    });
  });
});

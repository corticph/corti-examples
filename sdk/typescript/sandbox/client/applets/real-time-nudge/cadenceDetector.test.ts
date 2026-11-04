/**
 * Tests for the cadence detector — classification of text insertions into
 * cadence event types.
 */
import { describe, expect, it } from "vitest";
import { classifyInsertion } from "./cadenceDetector";

describe("classifyInsertion", () => {
  it("classifies a period followed by space as 'sentence'", () => {
    expect(classifyInsertion(". ")).toBe("sentence");
    expect(classifyInsertion("done. ")).toBe("sentence");
    expect(classifyInsertion("finished. Next")).toBe("sentence");
  });

  it("classifies a trailing period as 'sentence'", () => {
    expect(classifyInsertion(".")).toBe("sentence");
    expect(classifyInsertion("end.")).toBe("sentence");
  });

  it("classifies a single newline as 'line-break'", () => {
    expect(classifyInsertion("\n")).toBe("line-break");
    expect(classifyInsertion("text\n")).toBe("line-break");
    expect(classifyInsertion("line1\nline2")).toBe("line-break");
  });

  it("classifies double newline as 'paragraph'", () => {
    expect(classifyInsertion("\n\n")).toBe("paragraph");
    expect(classifyInsertion("para1\n\npara2")).toBe("paragraph");
    expect(classifyInsertion("\n \n")).toBe("paragraph");
  });

  it("classifies regular text as 'edit'", () => {
    expect(classifyInsertion("hello")).toBe("edit");
    expect(classifyInsertion("word")).toBe("edit");
    expect(classifyInsertion("123")).toBe("edit");
  });

  it("classifies text without period+space as 'edit'", () => {
    expect(classifyInsertion("no period here")).toBe("edit");
    expect(classifyInsertion("mid.dot.no.space")).toBe("edit");
  });

  it("prioritizes paragraph over line-break for double newline", () => {
    expect(classifyInsertion("text\n\nmore")).toBe("paragraph");
  });

  it("classifies a single character as 'edit'", () => {
    expect(classifyInsertion("a")).toBe("edit");
    expect(classifyInsertion(" ")).toBe("edit");
  });
});

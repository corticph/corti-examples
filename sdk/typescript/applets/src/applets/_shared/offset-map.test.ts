import { describe, it, expect } from "vitest";
import {
  diffEdit,
  transformRange,
  transformRanges,
  type Edit,
} from "./offset-map";

describe("diffEdit", () => {
  it("returns null for identical text", () => {
    expect(diffEdit("abc", "abc")).toBeNull();
  });
  it("detects an insertion", () => {
    expect(diffEdit("ac", "abc")).toEqual({ start: 1, end: 1, newLength: 1 });
  });
  it("detects a deletion", () => {
    expect(diffEdit("abc", "ac")).toEqual({ start: 1, end: 2, newLength: 0 });
  });
  it("detects an in-place replacement", () => {
    expect(diffEdit("pain", "Pain")).toEqual({
      start: 0,
      end: 1,
      newLength: 1,
    });
  });
  it("detects an appended segment", () => {
    expect(diffEdit("hello", "hello world")).toEqual({
      start: 5,
      end: 5,
      newLength: 6,
    });
  });
});

describe("transformRange", () => {
  const r = { start: 4, end: 9 }; // e.g. the word "world" in "hi … world"

  it("leaves a range before the edit untouched", () => {
    const edit: Edit = { start: 12, end: 12, newLength: 3 };
    expect(transformRange(r, edit)).toEqual(r);
  });
  it("shifts a range after the edit by the delta", () => {
    const edit: Edit = { start: 0, end: 0, newLength: 2 }; // insert 2 at start
    expect(transformRange(r, edit)).toEqual({ start: 6, end: 11 });
  });
  it("grows a range when text is inserted inside it", () => {
    const edit: Edit = { start: 6, end: 6, newLength: 3 }; // type inside
    expect(transformRange(r, edit)).toEqual({ start: 4, end: 12 });
  });
  it("preserves a range across an in-place same-length edit", () => {
    const edit: Edit = { start: 4, end: 5, newLength: 1 }; // capitalize first char
    expect(transformRange(r, edit)).toEqual({ start: 4, end: 9 });
  });
  it("drops a range fully replaced by the edit", () => {
    const edit: Edit = { start: 4, end: 9, newLength: 0 }; // delete the range
    expect(transformRange(r, edit)).toBeNull();
  });
});

describe("transformRanges", () => {
  it("shifts survivors and drops deleted ranges", () => {
    const ranges = [
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ];
    // delete [5,10): first range survives unchanged, second is dropped
    const out = transformRanges(ranges, { start: 5, end: 10, newLength: 0 });
    expect(out).toEqual([{ start: 0, end: 3 }]);
  });
});

/**
 * Offset maps for keeping text ranges valid across edits.
 *
 * Dictation applets track ranges that mean something (a dictated segment, a
 * selection target). When the underlying text changes — by dictation, a command,
 * or the user typing — those ranges must shift, split, or drop. These pure
 * helpers do that, plus derive an edit from an old→new text diff so DOM-backed
 * editors can report what changed without relying on InputEvent ranges.
 *
 * Portable: no app or DOM dependencies.
 */

/** A half-open range [start, end) into a text string. */
export interface Range {
  start: number;
  end: number;
}

/** A replacement of [start, end) with `newLength` characters. */
export interface Edit {
  start: number;
  end: number;
  newLength: number;
}

/** Derive the minimal single-span edit between two strings (prefix/suffix diff). */
export function diffEdit(oldText: string, newText: string): Edit | null {
  if (oldText === newText) {
    return null;
  }
  const maxPrefix = Math.min(oldText.length, newText.length);
  let prefix = 0;
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) {
    prefix++;
  }

  let suffix = 0;
  const maxSuffix = Math.min(oldText.length - prefix, newText.length - prefix);
  while (
    suffix < maxSuffix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }

  return {
    start: prefix,
    end: oldText.length - suffix,
    newLength: newText.length - prefix - suffix,
  };
}

/**
 * Transform one range across an edit, returning the new range or null when the
 * edit replaces the whole range. Positions are mapped with left gravity for the
 * range start and right gravity for the range end, so:
 *   - text inserted/typed inside a range grows the range (end moves right);
 *   - an in-place same-length edit preserves the range;
 *   - a range fully covered by the edit collapses and is dropped.
 */
export function transformRange(range: Range, edit: Edit): Range | null {
  const delta = edit.newLength - (edit.end - edit.start);
  const replacementEnd = edit.start + edit.newLength;

  const mapStart = (p: number) => (p <= edit.start ? p : p >= edit.end ? p + delta : edit.start);
  const mapEnd = (p: number) => (p <= edit.start ? p : p >= edit.end ? p + delta : replacementEnd);

  const start = mapStart(range.start);
  const end = mapEnd(range.end);
  if (end <= start) {
    return null;
  }
  return { start, end };
}

/** Transform a list of ranges, dropping any fully consumed by the edit. */
export function transformRanges(ranges: Range[], edit: Edit): Range[] {
  const out: Range[] = [];
  for (const r of ranges) {
    const t = transformRange(r, edit);
    if (t) {
      out.push(t);
    }
  }
  return out;
}

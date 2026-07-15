/**
 * Dictation text-insertion helpers — casing + spacing at the insertion boundary.
 *
 * Corti's /transcribe emits plain transcript segments; the HOST application is
 * responsible for splicing them into the editor with correct spacing and casing.
 * This module implements the rules from
 * https://docs.corti.ai/stt/best-practices-transcribe so the textarea,
 * contenteditable, and raw-SDK applets can all share identical behavior.
 *
 * Portable: this file has no app dependencies. Copy it alongside any example.
 */

/** Non-breaking space (U+00A0), used before certain French punctuation. */
const NBSP = "\u00A0";

/** Characters after which we must NOT add a space (opening brackets/quotes). */
const NO_SPACE_AFTER = new Set(["(", "[", "{", '"', "'", "“", "‘"]);

/** Characters that attach to the left — never prefix them with a space. */
const LEFT_ATTACH = new Set([",", ".", ":", ";", "!", "?", ")", "]", "}", "%"]);

/** In French, these take a non-breaking space *before* them. */
const FRENCH_NBSP_BEFORE = new Set([":", ";", "!", "?"]);

const WHITESPACE = new Set([" ", "\n", "\t", NBSP]);

/** Sentence-ending punctuation, used to decide when to auto-capitalize. */
const SENTENCE_END = new Set([".", "!", "?"]);

/**
 * French (but not Swiss French, fr-CH) inserts a non-breaking space before
 * certain punctuation. Match on the base language subtag only.
 */
function isFrench(primaryLanguage?: string): boolean {
  if (!primaryLanguage) return false;
  const lang = primaryLanguage.toLowerCase();
  return lang === "fr" || (lang.startsWith("fr") && lang !== "fr-ch");
}

/**
 * Decide the separator to place between `prevChar` (the char immediately before
 * the cursor) and `nextChar` (the first char of the incoming segment).
 * Returns "", a single space, or a non-breaking space (French punctuation).
 */
export function getLeadingSeparator(
  prevChar: string | null,
  nextChar: string,
  primaryLanguage?: string,
): string {
  // Start of field — never lead with a space.
  if (!prevChar) return "";
  // Already separated, or previous char forbids a following space.
  if (WHITESPACE.has(prevChar)) return "";
  if (NO_SPACE_AFTER.has(prevChar)) return "";
  // Incoming text already starts with whitespace.
  if (WHITESPACE.has(nextChar)) return "";
  // French punctuation gets a non-breaking space before it.
  if (isFrench(primaryLanguage) && FRENCH_NBSP_BEFORE.has(nextChar)) {
    return NBSP;
  }
  // Left-attaching punctuation hugs the preceding word.
  if (LEFT_ATTACH.has(nextChar)) return "";
  return " ";
}

/**
 * Capitalize the first alphabetic character of `segment` when it begins a new
 * sentence — i.e. at the very start of the field or after sentence-ending
 * punctuation. Casing is client-owned unless `automaticPunctuation` is enabled
 * server-side (in which case callers should pass `capitalize: false`).
 */
export function capitalizeForContext(
  textBeforeCursor: string,
  segment: string,
): string {
  if (!segment) return segment;
  const trimmedBefore = textBeforeCursor.replace(/[\s ]+$/, "");
  const atSentenceStart =
    trimmedBefore.length === 0 ||
    SENTENCE_END.has(trimmedBefore[trimmedBefore.length - 1]);
  if (!atSentenceStart) return segment;
  return segment.replace(
    /^(\s*)(\p{L})/u,
    (_m, ws, ch) => ws + ch.toUpperCase(),
  );
}

export interface InsertionOptions {
  primaryLanguage?: string;
  /** Auto-capitalize at sentence starts. Leave off when automaticPunctuation is on. */
  capitalize?: boolean;
}

/**
 * Build the exact string to splice at `cursor` for an incoming `segment`,
 * applying spacing-boundary rules and (optionally) sentence-start casing.
 * Does not mutate anything — returns the text to insert.
 */
export function buildInsertion(
  text: string,
  cursor: number,
  segment: string,
  options: InsertionOptions = {},
): string {
  if (!segment) return "";
  const { primaryLanguage, capitalize = true } = options;
  const prevChar = cursor > 0 ? text[cursor - 1] : null;
  const lead = getLeadingSeparator(prevChar, segment[0], primaryLanguage);
  const cased = capitalize
    ? capitalizeForContext(text.slice(0, cursor), segment)
    : segment;
  return lead + cased;
}

export interface SpliceResult {
  /** The new full text after insertion. */
  text: string;
  /** Cursor position after the inserted text. */
  cursor: number;
}

/**
 * Splice `segment` into `text` at the given selection, replacing any selected
 * range [selectionStart, selectionEnd). Convenience wrapper around
 * buildInsertion for plain-string editors (e.g. a textarea).
 */
export function spliceSegment(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  segment: string,
  options: InsertionOptions = {},
): SpliceResult {
  const insertion = buildInsertion(text, selectionStart, segment, options);
  const next =
    text.slice(0, selectionStart) + insertion + text.slice(selectionEnd);
  return { text: next, cursor: selectionStart + insertion.length };
}

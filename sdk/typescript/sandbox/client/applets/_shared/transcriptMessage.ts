/**
 * Normalizer for the `data` payload of `/transcribe` transcript messages.
 *
 * The shape of `data` depends on the session's `wordLevel` configuration:
 *
 * - `wordLevel` disabled (default): `data` is a single segment object —
 *   `text`, `start`/`end` in seconds, and `isFinal`. One message per segment;
 *   a non-final message is an interim preview (when `interimResults` is
 *   enabled).
 * - `wordLevel` enabled: finalized words are delivered batched — one message
 *   per finalized utterance whose `data` is a list of word items (`text`,
 *   `rawTranscriptText`, `start`/`end` in seconds, `isFinal: true`). Interim
 *   previews stay segment level and arrive as a one-element list whose single
 *   item has `isFinal: false`.
 *
 * `normalizeTranscriptMessageData` narrows either shape into a single
 * `TranscriptMessageBatch`, so consumers accumulate final items and track
 * interim previews without branching on the raw wire format. See
 * https://docs.corti.ai/stt/guides/wordlevel and
 * https://docs.corti.ai/api-reference/transcribe#word-level-transcripts.
 *
 * Portable: this file has no app dependencies. Copy it alongside any example.
 */

/** One segment (wordLevel off) or word (wordLevel on) item. */
export interface TranscriptMessageItem {
  /** The transcript text as returned, with formatting and punctuation applied. */
  text: string;
  /** The text as dictated, before post-processing. */
  rawTranscriptText?: string;
  /** Start of the segment/word in seconds, relative to the session start. */
  start?: number;
  /** End of the segment/word in seconds. */
  end?: number;
  /** `false` marks an interim preview item. */
  isFinal: boolean;
}

/**
 * The narrowed outcome of one transcript message:
 *
 * - `final` — items to append, in spoken order.
 * - `interim` — preview text for the in-progress segment.
 * - `ignore` — nothing usable in the payload.
 */
export type TranscriptMessageBatch =
  | { kind: "final"; items: TranscriptMessageItem[] }
  | { kind: "interim"; text: string }
  | { kind: "ignore" };

/**
 * Minimal structural check: `text` and `isFinal` are the only fields the
 * message schema requires, so only they gate the narrowing. Timing fields are
 * optional and left to the consumer.
 */
function isTranscriptMessageItem(value: unknown): value is TranscriptMessageItem {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { text?: unknown }).text === "string" &&
    typeof (value as { isFinal?: unknown }).isFinal === "boolean"
  );
}

/**
 * Narrow the `data` payload of a `/transcribe` transcript message into a
 * `TranscriptMessageBatch`, covering both the `wordLevel` shapes:
 *
 * - A one-element list whose item is not final is an interim preview.
 * - Any other non-empty list is a batch of finalized word items.
 * - A single non-final object is an interim preview; a single final object is
 *   a one-item final batch.
 */
export function normalizeTranscriptMessageData(data: unknown): TranscriptMessageBatch {
  if (Array.isArray(data)) {
    if (data.length === 1) {
      const [item] = data;
      if (isTranscriptMessageItem(item) && item.isFinal === false) {
        return { kind: "interim", text: item.text };
      }
    }
    // Final batches carry only finalized words; anything else in the list
    // (e.g. a stray preview) is dropped.
    const items = data.filter(
      (item): item is TranscriptMessageItem =>
        isTranscriptMessageItem(item) && item.isFinal !== false,
    );
    return items.length > 0 ? { kind: "final", items } : { kind: "ignore" };
  }
  if (isTranscriptMessageItem(data)) {
    return data.isFinal ? { kind: "final", items: [data] } : { kind: "interim", text: data.text };
  }
  return { kind: "ignore" };
}

/**
 * Cadence detector — watches a contentEditable element and emits typed
 * events based on documentation cadence (sentence completion, line breaks,
 * paragraph breaks, or generic edits). The nudge engine uses these to
 * decide when to evaluate the text — not on a timer, but when the
 * clinician pauses at a natural boundary.
 *
 * Detection strategy:
 * - Sentence: a period (`.`) followed by a space or newline is inserted.
 * - Line break: a single `\n` or `<br>` is inserted.
 * - Paragraph: a double `\n` (`\n\n`) or `<br><br>` is inserted.
 * - Edit: any other input event (typing, deletion, paste).
 *
 * For dictation: the onTranscript handler with `isFinal: true` should call
 * `emitEdit()` directly, since the transcript insertion is an edit to the
 * editor.
 */

export type CadenceEvent =
  | { type: "sentence" }
  | { type: "line-break" }
  | { type: "paragraph" }
  | { type: "edit" };

export type CadenceHandler = (event: CadenceEvent) => void;

/**
 * Classify a text insertion as a cadence event type.
 * Pure — no DOM access.
 */
export function classifyInsertion(insertedText: string): CadenceEvent["type"] {
  if (insertedText.includes("\n\n") || insertedText.includes("\n \n")) {
    return "paragraph";
  }
  if (insertedText.includes("\n")) {
    return "line-break";
  }
  // Sentence: period followed by space or at end of insertion (new sentence)
  if (/\.\s/.test(insertedText) || insertedText.endsWith(".")) {
    return "sentence";
  }
  return "edit";
}

/**
 * Attach a cadence detector to a contentEditable element.
 * Returns a cleanup function and an `emitEdit` method for external
 * triggers (e.g., dictation transcript insertion).
 */
export function attachCadenceDetector(
  el: HTMLElement,
  handler: CadenceHandler,
): { detach: () => void; emitEdit: () => void } {
  const onInput = (e: InputEvent) => {
    const inserted = e.data;
    if (e.inputType.startsWith("insert") && inserted) {
      const type = classifyInsertion(inserted);
      handler({ type } as CadenceEvent);
    } else {
      // Deletion, paste-as-plain-text (no data), etc.
      handler({ type: "edit" });
    }
  };

  el.addEventListener("input", onInput);

  return {
    detach: () => {
      el.removeEventListener("input", onInput);
    },
    emitEdit: () => {
      handler({ type: "edit" });
    },
  };
}

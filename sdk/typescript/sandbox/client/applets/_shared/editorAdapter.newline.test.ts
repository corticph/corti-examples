/**
 * @vitest-environment jsdom
 *
 * Regression test for dictated text landing on the wrong line after a "new
 * line" / "new paragraph" voice command (a keypress action of one or two
 * Enter keys → `replaceRange(caret, caret, "\n" | "\n\n")`).
 *
 * When focus is on the mic button (the common case during dictation), the
 * document selection is outside the editor. `getSelection()` then clamps to
 * `textContent.length`, and `offsetToPoint(el, textContent.length)` resolves to
 * the end of the last non-empty text node — which sits BEFORE any trailing
 * `<br>` the Enter command inserted. So the next dictated segment was spliced
 * in before the `<br>`, landing on the same line as the preceding text instead
 * of on the new line below. The fix resolves the true end-of-content point
 * (after trailing `<br>`s) when re-anchoring an out-of-editor write.
 */
import { describe, expect, it } from "vitest";
import { createContentEditableAdapter } from "./editorAdapter";

/** Build a contenteditable root, attached to the document so Selection works. */
function setupEditor(): HTMLElement {
  const root = document.createElement("div");
  root.setAttribute("contenteditable", "true");
  document.body.appendChild(root);
  return root;
}

/** Read the editor as plain text with <br> → \n (mirrors getPlainText). */
function plainText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  for (const br of Array.from(clone.querySelectorAll("br"))) {
    br.replaceWith(document.createTextNode("\n"));
  }
  return clone.textContent ?? "";
}

/**
 * Move the document selection out of the editor, as the mic button does when a
 * voice command fires mid-dictation. The `blur()` is required: in jsdom,
 * `document.body.focus()` alone doesn't relocate the selection out of the
 * contenteditable, so without it the out-of-editor re-anchor path this tests
 * wouldn't be exercised. A real click on the mic button blurs the editor
 * naturally, so this mirrors the browser.
 */
function focusAway(root: HTMLElement) {
  root.blur();
  document.body.focus();
}

describe("contenteditable: Enter command then dictation", () => {
  it("inserts dictated text on a NEW line after a single Enter command", () => {
    const root = setupEditor();
    const adapter = createContentEditableAdapter(root);

    // Dictate "hello world" (auto-capitalized to "Hello world" at field start).
    adapter.insert("hello world");
    focusAway(root);

    // A "new line" command (one Enter) dispatches replaceRange(caret, caret, "\n")
    // while focus is on the mic button — exactly as a spoken Enter command does.
    const sel = adapter.getSelection();
    adapter.replaceRange(sel.start, sel.end, "\n");

    // More dictation arrives while focus is still on the mic button.
    focusAway(root);
    adapter.insert("foo");

    // "foo" must land on the line below "Hello world", not after it on the
    // same line. Before the fix this produced "Hello world foo".
    expect(plainText(root)).toBe("Hello world\nfoo");
  });

  it("inserts dictated text two lines down after a double Enter (new paragraph)", () => {
    const root = setupEditor();
    const adapter = createContentEditableAdapter(root);

    adapter.insert("hello world");
    focusAway(root);

    const sel = adapter.getSelection();
    adapter.replaceRange(sel.start, sel.end, "\n\n");

    focusAway(root);
    adapter.insert("foo");

    // Two <br>s → a blank line between. Before the fix this produced
    // "Hello world foo\n\n" (text on the first line, breaks after it).
    expect(plainText(root)).toBe("Hello world\n\nfoo");
  });

  it("does not add a leading space on the new line", () => {
    const root = setupEditor();
    const adapter = createContentEditableAdapter(root);

    adapter.insert("hello world");
    focusAway(root);
    const sel = adapter.getSelection();
    adapter.replaceRange(sel.start, sel.end, "\n");
    focusAway(root);
    adapter.insert("foo");

    // The leading separator must be suppressed at a line start — no " foo".
    expect(plainText(root)).toBe("Hello world\nfoo");
    expect(plainText(root).includes(" foo")).toBe(false);
  });
});

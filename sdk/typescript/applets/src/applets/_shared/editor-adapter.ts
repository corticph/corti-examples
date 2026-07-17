/**
 * EditorAdapter — a small, framework-agnostic seam over an editable control.
 *
 * Dictation insertion and command execution should not care whether the target
 * is a <textarea>, a contenteditable surface, or (eventually) a native control
 * reached through a host bridge. Each adapter exposes the same imperative
 * surface; the STT integration logic (insertion casing/spacing, command
 * dispatch) is written once against this interface.
 *
 * Adapters are DOM-backed and operate imperatively — they do NOT assume a
 * React-controlled value — which mirrors how a real "speech-enable any control"
 * integration must work against arbitrary application UI.
 *
 * Portable: depends only on text-insertion.ts.
 */
import { buildInsertion, type InsertionOptions } from "./text-insertion";

export interface EditorSelection {
  start: number;
  end: number;
}

export type FormatStyle = "bold" | "italic" | "underline" | "normal";

/** Range an inserted segment occupies in the resulting text. */
export interface InsertResult {
  start: number;
  end: number;
}

export interface EditorAdapter {
  /** Plain-text content of the control. */
  getText(): string;
  /** Current selection as text offsets. */
  getSelection(): EditorSelection;
  /** Move the selection/caret to a text-offset range and focus the control. */
  setSelection(start: number, end: number): void;
  /**
   * Insert a dictation segment at the current selection (replacing it),
   * applying spacing/casing boundary rules. Returns the inserted range.
   */
  insert(segment: string, options?: InsertionOptions): InsertResult;
  /** Replace an explicit text-offset range with raw text (no boundary rules). */
  replaceRange(start: number, end: number, text: string): void;
  /** Apply inline formatting to the current selection (rich editors only). */
  applyFormat?(style: FormatStyle): void;
  /** Whether this adapter supports rich formatting. */
  readonly richText: boolean;
  focus(): void;
}

/* ------------------------------------------------------------------ */
/* textarea / input                                                    */
/* ------------------------------------------------------------------ */

export function createTextareaAdapter(el: HTMLTextAreaElement | HTMLInputElement): EditorAdapter {
  const getSelection = (): EditorSelection => ({
    start: el.selectionStart ?? el.value.length,
    end: el.selectionEnd ?? el.value.length,
  });

  const setSelection = (start: number, end: number) => {
    el.focus();
    el.setSelectionRange(start, end);
  };

  return {
    richText: false,
    getText: () => el.value,
    getSelection,
    setSelection,
    focus: () => el.focus(),
    insert(segment, options) {
      const { start, end } = getSelection();
      const insertion = buildInsertion(el.value, start, segment, options);
      el.value = el.value.slice(0, start) + insertion + el.value.slice(end);
      const caret = start + insertion.length;
      setSelection(caret, caret);
      return { start, end: caret };
    },
    replaceRange(start, end, text) {
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
      const caret = start + text.length;
      setSelection(caret, caret);
    },
  };
}

/* ------------------------------------------------------------------ */
/* contenteditable                                                     */
/* ------------------------------------------------------------------ */

/** Absolute text offset of a (node, offset) DOM point within `root`. */
function pointToOffset(root: HTMLElement, node: Node, nodeOffset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, nodeOffset);
  return range.toString().length;
}

/** Resolve an absolute text offset to a DOM (node, offset) point within `root`. */
function offsetToPoint(root: HTMLElement, offset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let lastText: Text | null = null;
  let current = walker.nextNode() as Text | null;
  while (current) {
    lastText = current;
    const len = current.textContent?.length ?? 0;
    if (remaining <= len) {
      return { node: current, offset: remaining };
    }
    remaining -= len;
    current = walker.nextNode() as Text | null;
  }
  // Past the end — clamp to the end of the last text node (or root itself).
  if (lastText) {
    return { node: lastText, offset: lastText.textContent?.length ?? 0 };
  }
  return { node: root, offset: 0 };
}

export function createContentEditableAdapter(el: HTMLElement): EditorAdapter {
  const getSelection = (): EditorSelection => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      const len = el.textContent?.length ?? 0;
      return { start: len, end: len };
    }
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) {
      const len = el.textContent?.length ?? 0;
      return { start: len, end: len };
    }
    return {
      start: pointToOffset(el, range.startContainer, range.startOffset),
      end: pointToOffset(el, range.endContainer, range.endOffset),
    };
  };

  const setSelection = (start: number, end: number) => {
    el.focus();
    const sel = window.getSelection();
    if (!sel) {
      return;
    }
    const from = offsetToPoint(el, start);
    const to = offsetToPoint(el, end);
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const insertTextAtSelection = (text: string): InsertResult => {
    const sel = window.getSelection();
    const { start } = getSelection();
    if (!sel || sel.rangeCount === 0) {
      return { start, end: start };
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();

    let lastNode: Node;
    if (!text.includes("\n")) {
      // Fast path: no newlines — insert a single text node.
      lastNode = document.createTextNode(text);
      range.insertNode(lastNode);
    } else {
      // Split on newlines; interleave text nodes and <br> elements.
      const parts = text.split("\n");
      const frag = document.createDocumentFragment();
      lastNode = document.createTextNode("");
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          lastNode = document.createElement("br");
          frag.appendChild(lastNode);
        }
        if (parts[i]) {
          lastNode = document.createTextNode(parts[i]);
          frag.appendChild(lastNode);
        }
      }
      range.insertNode(frag);
    }

    range.setStartAfter(lastNode);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return { start, end: start + text.length };
  };

  /** True when the cursor is positioned immediately after a <br> element. */
  const isAfterBr = (): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      return false;
    }
    const { startContainer, startOffset } = sel.getRangeAt(0);
    if (startContainer.nodeType !== Node.ELEMENT_NODE || startOffset === 0) {
      return false;
    }
    return (startContainer as Element).childNodes[startOffset - 1]?.nodeName === "BR";
  };

  return {
    richText: true,
    getText: () => el.textContent ?? "",
    getSelection,
    setSelection,
    focus: () => el.focus(),
    insert(segment, options) {
      const { start } = getSelection();
      // el.textContent has no \n for <br> nodes; if cursor is right after a <br>,
      // append a synthetic \n so getLeadingSeparator suppresses the leading space.
      const raw = (el.textContent ?? "").slice(0, start);
      const before = isAfterBr() ? `${raw}\n` : raw;
      const insertion = buildInsertion(before, before.length, segment, options);
      return insertTextAtSelection(insertion);
    },
    replaceRange(start, end, text) {
      setSelection(start, end);
      insertTextAtSelection(text);
    },
    applyFormat(style) {
      el.focus();
      if (style === "normal") {
        document.execCommand("removeFormat");
        return;
      }
      document.execCommand(style);
    },
  };
}

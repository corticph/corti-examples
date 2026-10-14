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
import { buildInsertion, type InsertionOptions } from "./textInsertion";

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
  /**
   * Full markup of the control, for snapshot/restore (rich editors only).
   *
   * Exists so a whole-document rewrite can be undone exactly. `getText` loses
   * formatting, and the cleanup agent's rewrite flattens it, so a text-only
   * snapshot would restore the words but not the bold/italic that was there
   * before. Callers must fall back to text when an adapter omits this.
   */
  getHTML?(): string;
  /** Restore markup previously read from `getHTML`, replacing all content. */
  setHTML?(html: string): void;
  /**
   * Whole content as plain text WITH line breaks, for whole-document round-trips
   * through an external service.
   *
   * Deliberately separate from `getText()`, which returns `textContent` — where a
   * `<br>` contributes no `\n`. That is correct for `getText`, because the entire
   * offset model (`pointToOffset` / `offsetToPoint`, insertion boundaries,
   * dictation history ranges, undo selections) is built on those offsets and
   * inserting phantom newlines would desync every one of them. But it means
   * `getText()` silently flattens a multi-line draft, so anything that sends the
   * document somewhere and writes the answer back must use this instead.
   */
  getPlainText?(): string;
  /** Replace all content with plain text, rendering `\n` as real line breaks. */
  setPlainText?(text: string): void;
  /**
   * Extend the selection to the start/end of the current LINE and report
   * whether it moved.
   *
   * Exists because a line is not something the text-offset model can locate. In
   * a contenteditable a line break is a `<br>`, which contributes no `\n` to
   * `textContent`, so scanning the text for newlines finds none and "start of
   * line" collapses to "start of document" — that mistake deleted whole drafts.
   * Only the browser knows where a visual line begins, so the boundary is
   * resolved through `Selection.modify` here and read back as offsets.
   *
   * Optional: an adapter that cannot resolve a line must omit this rather than
   * approximate it, so callers skip the action instead of deleting too much.
   */
  extendToLineBoundary?(direction: "back" | "forward"): boolean;
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
    // A textarea's value already IS plain text with newlines.
    getPlainText: () => el.value,
    setPlainText(text) {
      el.value = text;
      const caret = text.length;
      setSelection(caret, caret);
    },
    // A textarea's value carries real newlines, so its line boundaries ARE
    // findable in the text — no need to consult the browser.
    extendToLineBoundary(direction) {
      const { start, end } = getSelection();
      const value = el.value;
      if (direction === "back") {
        const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        if (lineStart >= start) {
          return false;
        }
        setSelection(lineStart, end);
        return true;
      }
      const nextBreak = value.indexOf("\n", end);
      const lineEnd = nextBreak === -1 ? value.length : nextBreak;
      if (lineEnd <= end) {
        return false;
      }
      setSelection(start, lineEnd);
      return true;
    },
  };
}

/* ------------------------------------------------------------------ */
/* contenteditable                                                     */
/* ------------------------------------------------------------------ */

/**
 * Absolute text offset of a (node, offset) DOM point within `root`.
 *
 * Exported for the undo history, which snapshots and restores selections
 * against the same textContent-based offset space this adapter uses.
 */
export function pointToOffset(root: HTMLElement, node: Node, nodeOffset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, nodeOffset);
  return range.toString().length;
}

/** Resolve an absolute text offset to a DOM (node, offset) point within `root`. */
export function offsetToPoint(root: HTMLElement, offset: number): { node: Node; offset: number } {
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

/** Zero-width space — a transient caret anchor inserted after a trailing
 *  `<br>` (see stripZwspAnchors). It is not content. */
export const ZWSP = "​";

/** True for a text node that holds real content (not empty, not a `​` anchor). */
export function hasContent(node: Node): boolean {
  if (node.nodeType !== Node.TEXT_NODE) {
    return false;
  }
  const text = node.textContent ?? "";
  return text.length > 0 && text !== ZWSP;
}

/**
 * Determine whether a `<br>` is the structural trailing one — the last
 * child of the root or nested inside the last child of the root (e.g.
 * `<div>text<br></div>` where the `<div>` is the root's only/last
 * child). This `<br>` exists to give the contenteditable a minimum
 * height and is never followed by dictated text.
 *
 * Uses `nextSibling` (not `lastElementChild`) so text nodes are
 * considered — a `<br>` followed by a text node is NOT structural.
 * Uses `hasContent` so a `​` caret anchor doesn't count as content.
 */
export function isStructuralTrailingBr(br: Element, root: HTMLElement): boolean {
  if (!root.contains(br)) {
    return false;
  }
  // The <br> must have no following siblings with content (text or element) in
  // its parent — or only empty/ZWSP-only text nodes.
  let sibling = br.nextSibling;
  while (sibling) {
    if (sibling.nodeType === Node.TEXT_NODE && hasContent(sibling)) {
      return false;
    }
    if (sibling.nodeType === Node.ELEMENT_NODE) {
      return false;
    }
    sibling = sibling.nextSibling;
  }
  // The <br>'s parent must be the root, or the last child of the root
  // (again checking with text nodes for content).
  const parent = br.parentNode;
  if (parent === root) {
    return true;
  }
  // Check that parent is the last child of root (no content siblings
  // after parent).
  let pSibling = parent?.nextSibling;
  while (pSibling) {
    if (pSibling.nodeType === Node.TEXT_NODE && hasContent(pSibling)) {
      return false;
    }
    if (pSibling.nodeType === Node.ELEMENT_NODE) {
      return false;
    }
    pSibling = pSibling.nextSibling;
  }
  return true;
}

/**
 * Resolve the true end-of-content DOM point — AFTER any trailing command
 * `<br>` elements but BEFORE the structural trailing `<br>` — and whether
 * that point sits immediately after a line break.
 *
 * The adapter's offset model is textContent-based, so a trailing `<br>`
 * (which contributes nothing to textContent) is invisible to it:
 * `offsetToPoint(el, textContent.length)` resolves to the end of the last
 * non-empty text node, which sits BEFORE any trailing `<br>`s. When focus is
 * outside the editor (on the mic button) and the last edit was a "new line" /
 * "new paragraph" command, that resolves to the previous line — so the next
 * dictated segment inserted there lands on the same line, before the `<br>`.
 *
 * This walks to the actual end of the DOM tree instead: the ZWSP text node a
 * trailing-`<br>` insert anchors in (see insertTextAtSelection), or a point
 * after the last command `<br>`. It does NOT go past the structural trailing
 * `<br>` — that `<br>` gives the contenteditable its minimum height and does
 * not represent a visual line break. Going past it would insert text below
 * it, consuming the structural `<br>` and breaking the overlay's
 * `isStructuralTrailingBr` heuristic (which assumes the structural `<br>` is
 * always the last element). It also reports whether a `<br>` immediately
 * precedes the point, so `insert` can suppress the leading separator.
 *
 * Exported so the caret-overlay hook can resolve the preview to the same line
 * the next dictated segment will land on — keeping the overlay and the insert
 * in agreement.
 *
 * Only meaningful at end-of-content — the offset model is authoritative
 * everywhere else, where `<br>`s are mid-document and visible to textContent
 * boundaries.
 */
export function endOfContentPoint(el: HTMLElement): {
  node: Node;
  offset: number;
  afterBr: boolean;
} {
  // Walk every node to the end of the tree, tracking the last usable anchor
  // and whether a <br> immediately precedes it.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ALL);
  let lastText: Text | null = null;
  let lastNode: Node = el;
  let lastOffset = 0;
  let sawBrBeforeLastText = false;
  let current = walker.nextNode() as Node | null;
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      const text = current.textContent ?? "";
      // An empty text node — or one holding only a zero-width-space caret
      // anchor (see stripZwspAnchors) — is an anchor, not content that covers
      // the preceding break: keep the afterBr flag it inherits. A text node
      // with real content IS content after the break, so the point no longer
      // sits after a <br>. The ZWSP anchor is transient (stripped before the
      // next write), so it never represents real content.
      const isAnchor = text.length === 0 || text === ZWSP;
      lastText = current as Text;
      lastNode = current;
      lastOffset = text.length;
      if (!isAnchor) {
        sawBrBeforeLastText = false;
      }
    } else if (current.nodeType === Node.ELEMENT_NODE && current.nodeName === "BR") {
      sawBrBeforeLastText = true;
      lastNode = current;
      lastOffset = 0; // anchors after the <br> via its parent's offset
    }
    current = walker.nextNode() as Node | null;
  }
  // If the last node visited is a <br>, anchor after it in its parent —
  // UNLESS it is the structural trailing <br>, which does not represent a
  // visual line break. In that case anchor BEFORE it (after the preceding
  // command <br>, or at the end of the last text node if there are no
  // command <br>s).
  if (lastNode.nodeType === Node.ELEMENT_NODE && lastNode.nodeName === "BR") {
    if (isStructuralTrailingBr(lastNode as Element, el)) {
      // Structural <br> — don't go past it. Anchor at the end of the last
      // text node (or the ZWSP anchor, which sits between the command <br>s
      // and the structural one).
      if (lastText) {
        return {
          node: lastText,
          offset: lastOffset,
          afterBr: sawBrBeforeLastText,
        };
      }
      // No text node at all (e.g. empty editor <div><br></div>) — anchor
      // before the structural <br>.
      const parent = (lastNode.parentNode as ParentNode) ?? el;
      const offsetInParent = Array.from(parent.childNodes).indexOf(lastNode as ChildNode);
      return { node: parent as Node, offset: offsetInParent, afterBr: false };
    }
    // Command <br> — anchor after it.
    const parent = (lastNode.parentNode as ParentNode) ?? el;
    const offsetInParent = Array.from(parent.childNodes).indexOf(lastNode as ChildNode) + 1;
    return { node: parent as Node, offset: offsetInParent, afterBr: true };
  }
  if (lastText) {
    return {
      node: lastText,
      offset: lastOffset,
      afterBr: sawBrBeforeLastText,
    };
  }
  return { node: el, offset: 0, afterBr: false };
}

/**
 * Remove transient zero-width-space (`​`) caret-anchor text nodes from `el`.
 *
 * A `​` anchor is what makes Chrome paint the caret on the correct line after
 * a trailing `<br>` (see `insertTextAtSelection`), but it must never enter the
 * textContent-based offset model, so it is stripped before the next write.
 * Text nodes that contain ONLY `​` are removed; a `​` mixed into real text is
 * left untouched (the adapter never produces that, but don't corrupt user
 * content if one somehow appears).
 *
 * If the document selection sits inside a removed node, it is re-anchored to
 * the end of the previous sibling (or the start of the next, or the parent) so
 * the caret survives at the same logical position — the `​` contributed nothing
 * to textContent, so the offset model reads the same offset before and after.
 */
export function stripZwspAnchors(el: HTMLElement): void {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const toRemove: Text[] = [];
  let cur = walker.nextNode() as Text | null;
  while (cur) {
    if (cur.textContent === ZWSP) {
      toRemove.push(cur);
    }
    cur = walker.nextNode() as Text | null;
  }
  if (toRemove.length === 0) {
    return;
  }
  // If the caret is inside one of the nodes we're about to remove, re-anchor it
  // first so it isn't left dangling (which would collapse to the editor root).
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    if (toRemove.includes(r.startContainer as Text)) {
      const node = r.startContainer as Text;
      const prev = node.previousSibling;
      const next = node.nextSibling;
      const newRange = document.createRange();
      if (prev && prev.nodeType === Node.TEXT_NODE) {
        // End of the previous text node — same logical offset.
        newRange.setStart(prev, (prev.textContent ?? "").length);
      } else if (prev && prev.nodeType === Node.ELEMENT_NODE) {
        // After the previous element (e.g. a <br>) — anchoring INSIDE it would
        // make the next insert a child of that element.
        newRange.setStartAfter(prev);
      } else if (next && next.nodeType === Node.TEXT_NODE) {
        newRange.setStart(next, 0);
      } else if (next && next.nodeType === Node.ELEMENT_NODE) {
        newRange.setStartBefore(next);
      } else {
        newRange.setStart(node.parentNode ?? el, 0);
      }
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  }
  for (const node of toRemove) {
    node.remove();
  }
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

  /** Delegate to the exported standalone (see above). */
  const endOfContentPointFn = (): {
    node: Node;
    offset: number;
    afterBr: boolean;
  } => endOfContentPoint(el);

  /**
   * Insert at the caret, re-anchoring to the end of `el` when the document
   * selection is not inside this editor.
   *
   * The caret very often ISN'T in the editor when a transcript arrives —
   * clicking the mic button, a toolbar button, or any side-panel input moves
   * it. Previously this bailed silently when there was no selection at all and,
   * worse, inserted into `sel.getRangeAt(0)` wherever that happened to be, so
   * dictated text either vanished or was typed into an unrelated control.
   * `getSelection()` above already clamps out-of-editor READS to end-of-content;
   * this makes writes agree with it.
   *
   * Focus is deliberately not moved: re-anchoring appends to this editor while
   * leaving the user's keyboard focus wherever they put it.
   */
  const insertTextAtSelection = (text: string): InsertResult => {
    const sel = window.getSelection();
    const selectionInEditor =
      !!sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer);

    // Remove any zero-width-space caret anchors left by a previous trailing-
    // <br> insert (see the anchor logic below). A ​ anchor is what makes
    // Chrome paint the caret on the correct line after a <br>, but it must not
    // enter the textContent-based offset model, so it is transient: created for
    // painting, stripped before the next write. The caret, if it was inside one
    // of these nodes, is moved to the node's position so it survives the
    // removal.
    stripZwspAnchors(el);

    let range: Range;
    if (selectionInEditor && sel) {
      range = sel.getRangeAt(0);
    } else {
      // Re-anchor to the TRUE end of content — after any trailing <br>s a
      // "new line"/"new paragraph" command left behind. offsetToPoint would
      // resolve textContent.length to before those <br>s, so the next segment
      // would land on the previous line.
      const point = endOfContentPointFn();
      range = document.createRange();
      range.setStart(point.node, point.offset);
      range.collapse(true);
    }

    // Must be read before deleteContents() mutates the DOM under the range.
    const start = pointToOffset(el, range.startContainer, range.startOffset);
    range.deleteContents();

    let lastNode: Node;
    if (!text.includes("\n")) {
      // Fast path: no newlines — insert a single text node.
      lastNode = document.createTextNode(text);
      range.insertNode(lastNode);
    } else {
      // Split on newlines; interleave text nodes and <br> elements. Only
      // non-empty parts get a text node, so the DOM stays clean (just <br>s,
      // no stray empty text nodes).
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

    // When the text ends with a newline, `lastNode` is the trailing <br>.
    // Chrome paints a caret anchored after an element node one visual line too
    // high — a well-known contenteditable quirk. For a single <br> an empty
    // text-node anchor paints at the correct line, but for two or more
    // consecutive <br>s ("new paragraph") an empty anchor yields no client
    // rect, so Chrome still draws the caret one line too high.
    //
    // A zero-width space (​) anchor gives the empty line a measurable
    // position, so Chrome paints the caret at the correct line for ANY number
    // of trailing <br>s (verified in Chrome: 38px after one <br>, 61px after
    // two — matching where the next text lands). The anchor is transient:
    // stripZwspAnchors (called at the top of the next insert/replaceRange)
    // removes it before any write, so it never enters the textContent-based
    // offset model (pointToOffset/offsetToPoint). Only this anchor case uses
    // setStart; every other insert keeps setStartAfter so the caret lands
    // after the inserted text.
    let anchoredInTextNode = false;
    const lastParent = lastNode.parentNode;
    if (lastNode.nodeName === "BR" && lastParent) {
      const anchor = document.createTextNode("​");
      lastParent.insertBefore(anchor, lastNode.nextSibling);
      lastNode = anchor;
      anchoredInTextNode = true;
    }

    if (anchoredInTextNode) {
      range.setStart(lastNode, 0);
    } else {
      range.setStartAfter(lastNode);
    }
    range.collapse(true);
    // Only move the document selection if it was already in this editor —
    // otherwise this would yank the caret out of whatever the user is using.
    if (selectionInEditor && sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
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
    getText: () => (el.textContent ?? "").replace(/​/g, ""),
    getSelection,
    setSelection,
    focus: () => el.focus(),
    insert(segment, options) {
      // Strip transient ZWSP caret anchors before reading offsets so the
      // textContent-based offset model never sees them.
      stripZwspAnchors(el);
      const sel = window.getSelection();
      const selectionInEditor =
        !!sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer);
      const { start } = getSelection();
      // el.textContent has no \n for <br> nodes; if the caret is right after a
      // <br>, append a synthetic \n so getLeadingSeparator suppresses the
      // leading space. When focus is on the mic button the document selection
      // isn't in the editor, so isAfterBr() can't see it — use endOfContentPoint
      // instead, which resolves the true end-of-content anchor and reports
      // whether a <br> precedes it.
      const afterBr = selectionInEditor ? isAfterBr() : endOfContentPointFn().afterBr;
      const raw = (el.textContent ?? "").slice(0, start);
      const before = afterBr ? `${raw}\n` : raw;
      const insertion = buildInsertion(before, before.length, segment, options);
      return insertTextAtSelection(insertion);
    },
    replaceRange(start, end, text) {
      // Strip transient ZWSP caret anchors before resolving offsets so the
      // textContent-based offset model never sees them. A stale start/end
      // from a prior ZWSP (off by one) still resolves correctly: offsetToPoint
      // clamps past-the-end offsets to the last text node.
      stripZwspAnchors(el);
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
    getHTML: () => el.innerHTML.replace(/​/g, ""),
    setHTML(html) {
      el.innerHTML = html;
    },
    /**
     * Read the document as plain text, turning structure back into newlines.
     *
     * Done on a clone so `<br>` can be swapped for a real "\n" text node and
     * `textContent` then reports the breaks that `getText()` cannot see. Block
     * elements get a leading newline when something precedes them, which covers
     * the `<div>`-per-paragraph shape Chrome produces when the user presses
     * Enter, alongside the `<br>`s our own insertion writes.
     */
    getPlainText() {
      const clone = el.cloneNode(true) as HTMLElement;
      for (const br of Array.from(clone.querySelectorAll("br"))) {
        br.replaceWith(document.createTextNode("\n"));
      }
      for (const block of Array.from(
        clone.querySelectorAll("div,p,li,h1,h2,h3,h4,h5,h6,blockquote,pre"),
      )) {
        if (block.previousSibling) {
          block.prepend(document.createTextNode("\n"));
        }
      }
      return (clone.textContent ?? "").replace(/​/g, "");
    },
    setPlainText(text) {
      // Only re-place the caret if the user was actually in here — the cleanup
      // agent finishes long after they may have moved on, and yanking focus back
      // mid-sentence elsewhere would be worse than leaving the caret alone.
      const sel = window.getSelection();
      const hadCaret =
        el.contains(document.activeElement) ||
        (!!sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer));

      const fragment = document.createDocumentFragment();
      const parts = text.split("\n");
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          fragment.appendChild(document.createElement("br"));
        }
        if (parts[i]) {
          fragment.appendChild(document.createTextNode(parts[i]));
        }
      }
      el.replaceChildren(fragment);

      if (hadCaret) {
        const length = el.textContent?.length ?? 0;
        setSelection(length, length);
      }
    },
    /**
     * Delegates to `Selection.modify(… "lineboundary")` — the same line model
     * the browser uses for Cmd+Backspace, so a command bound to those keys
     * behaves exactly like pressing them.
     */
    extendToLineBoundary(direction) {
      const sel = window.getSelection();
      if (!sel || typeof sel.modify !== "function") {
        return false;
      }
      const inEditor = sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer);
      if (!inEditor) {
        // Same re-anchoring rule as insertion: the caret is very often outside
        // the editor when a voice command lands (the mic button took focus), and
        // the intended target is the text just dictated, at the end.
        const length = el.textContent?.length ?? 0;
        setSelection(length, length);
      }
      const before = getSelection();
      sel.modify("extend", direction === "back" ? "backward" : "forward", "lineboundary");
      const after = getSelection();
      return after.start !== before.start || after.end !== before.end;
    },
  };
}

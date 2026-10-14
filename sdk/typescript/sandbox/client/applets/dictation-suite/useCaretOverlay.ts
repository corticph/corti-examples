/**
 * useCaretOverlay — pixel coordinates for an inline interim-preview overlay.
 *
 * The dictation suite shows non-final transcript text as a preview at the
 * caret, so the user's eyes stay where the text will land rather than at a
 * fixed line below the editor. This hook resolves where that overlay should sit.
 *
 * The anchor deliberately mirrors the EditorAdapter's own insert target:
 * `adapter.getSelection().end` clamps to end-of-content when the document
 * selection is outside the editor (focus is on the mic button, a toolbar
 * control, a side panel…), which is exactly where `insertTextAtSelection`
 * re-anchors a write. So the overlay and the actual insert agree in both the
 * in-editor and out-of-editor cases.
 *
 * The interim text is NEVER injected into the contenteditable DOM — that would
 * corrupt the adapter's text-node/`<br>` offset model (insertion, commands, the
 * cleanup snapshot/restore). The coordinates returned here position a sibling
 * overlay element outside the editor.
 */
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  hasContent,
  isStructuralTrailingBr,
  offsetToPoint,
  type EditorAdapter,
} from "../_shared/editorAdapter";

export interface CaretOverlayPos {
  /** Pixels from the editor wrapper's top edge. */
  top: number;
  /** Pixels from the editor wrapper's left edge. */
  left: number;
  /** Max width in px so a long interim wraps within the editor, not past it. */
  maxWidth: number;
  /** True when the caret is at the content origin (left gutter) — the caller
   *  should skip the leading space before the interim text. */
  atLineStart: boolean;
}

/** Fallback padding in px when computed style is unavailable. */
const FALLBACK_PADDING = 12;

/**
 * Resolve the caret rect relative to the editor element. Returns null when no
 * usable position can be computed (no editor, no adapter, or a degenerate
 * range that can't be distinguished from an unfocused viewport).
 */
function resolveCaretPos(
  editorEl: HTMLElement,
  adapter: EditorAdapter,
  cache: GeomCache,
): CaretOverlayPos | null {
  const editorRect = editorEl.getBoundingClientRect();
  const sel = adapter.getSelection();
  const point = offsetToPoint(editorEl, sel.end);
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);

  // getClientRects() is the reliable way to measure a collapsed range.
  // getBoundingClientRect() on a collapsed range returns a zero rect (or a
  // viewport-origin rect) in common states — caret after a <br>, caret on an
  // empty line, caret at a text-node boundary — which previously made the
  // overlay snap to the editor's top-left corner and "float around".
  //
  // At a line-break boundary (caret right after a <br>, or a text-node
  // boundary that wraps), getClientRects() returns TWO rects: the end of the
  // current line and the start of the next. The first rect is the end of the
  // *previous* line — using it rendered the overlay one line above the caret
  // (vertical drift). New text lands at the start of the next line, so pick
  // the rect with the smallest `left` when there's more than one.
  const rects = range.getClientRects();
  let caretRect: DOMRect | null = null;
  if (rects.length === 1) {
    caretRect = rects[0];
  } else if (rects.length > 1) {
    caretRect = Array.from(rects).reduce((a, b) => (a.left <= b.left ? a : b));
  }

  const padding = cache.padding;
  const isEmpty = (editorEl.textContent ?? "").length === 0;
  // An empty/never-focused editor yields no rects (or a degenerate one); fall
  // back to the content origin.
  if (isEmpty || caretRect === null) {
    return {
      top: padding,
      left: padding,
      maxWidth: Math.max(0, editorEl.clientWidth - padding * 2),
      atLineStart: true,
    };
  }

  const top = caretRect.top - editorRect.top;
  const left = caretRect.left - editorRect.left;
  // The caret rect is the font's em-box (e.g. 17px); the overlay span uses the
  // editor's line-height (e.g. 22.75px), so the line-box is taller than the
  // em-box by ~half-leading on each side. Anchoring the overlay's top at the
  // caret's top puts its glyphs one half-leading below the caret's glyphs — a
  // small "a bit below" offset. Lift the overlay by half that difference so
  // the overlay's text baseline lines up with the caret's.
  const lineHeightPx = cache.lineHeight;
  const halfLeading = (lineHeightPx - caretRect.height) / 2;
  const liftedTop = halfLeading > 0 ? top - halfLeading : top;

  // The adapter's offset model is textContent-based, so it can't see <br> or
  // block elements — they contribute nothing to textContent. When a voice
  // command like "new paragraph" inserts a trailing <br> (or several) at the
  // end, sel.end clamps to textContent.length, offsetToPoint resolves to the
  // end of the last text node, and the caret rect lands on the ORIGINAL line
  // — not the new empty line below where the next dictated text will appear.
  // Drop the overlay down one line per trailing <br>, and reset left to
  // the content origin (a new line starts at the left gutter).
  //
  // The structural trailing <br> (the empty-editor placeholder that Chrome
  // always keeps at the end) is excluded when the document selection is in
  // the editor — the adapter's insert uses the document selection at the
  // caret, which sits BEFORE the structural <br> (after a ZWSP anchor between
  // the command <br> and the structural one), so text lands before it and the
  // overlay must not drop a line for it. When the selection is outside the
  // editor (mic button has focus), the adapter's insert resolves the
  // end-of-content point via endOfContentPoint AFTER all trailing <br>s,
  // including the structural one, so every <br> is counted.
  const docSel = window.getSelection();
  const selectionInEditor =
    !!docSel &&
    docSel.rangeCount > 0 &&
    editorEl.contains(docSel.getRangeAt(0).commonAncestorContainer);
  const trailingBreaks = countTrailingBreaksAfter(
    editorEl,
    point,
    selectionInEditor,
  );

  if (trailingBreaks > 0) {
    return {
      top: liftedTop + trailingBreaks * lineHeightPx,
      left: padding,
      maxWidth: Math.max(0, editorEl.clientWidth - padding * 2),
      atLineStart: true,
    };
  }

  return {
    top: liftedTop,
    left,
    maxWidth: Math.max(0, editorEl.clientWidth - left - padding),
    atLineStart: left <= padding,
  };
}

/** Re-exported for test imports (see useCaretOverlay.test.ts). */
export { isStructuralTrailingBr };

/**
 * Count trailing `<br>` elements after the resolved caret point that
 * represent real visual line breaks. The adapter's offset model is
 * `textContent`-based, so a trailing `<br>` is invisible to it:
 * `sel.end` clamps to `textContent.length` and `offsetToPoint` lands at
 * the end of the last text node, even when `<br>` elements follow. Each
 * such trailing `<br>` means the caret is actually on a lower line than
 * the resolved rect reports.
 *
 * Only counts `<br>` elements (not `<div>`/`<p>` wrappers — the wrapper
 * doesn't add a visual line, the `<br>` inside it does).
 *
 * When `excludeStructural` is false (the out-of-editor / mouse-click case),
 * EVERY trailing `<br>` is counted — the adapter's `insert` resolves the
 * end-of-content point via `endOfContentPoint`, which lands AFTER all
 * trailing `<br>`s, so the next dictated segment lands below every one
 * of them and the overlay must drop a line per `<br>` to match.
 *
 * When `excludeStructural` is true (the in-editor / handheld-mic case),
 * the structural trailing `<br>` is excluded — the adapter's `insert`
 * uses the document selection at the caret, which sits BEFORE the
 * structural `<br>` (after a ZWSP anchor between the command `<br>` and
 * the structural one), so text lands before it and the overlay must not
 * drop a line for it. Subtracting it keeps the overlay in step with the
 * caret position.
 *
 * Only counts `<br>`s that come after ALL non-empty text nodes — a
 * `<br>` followed by more text is a mid-document break, not trailing.
 */
export function countTrailingBreaksAfter(
  root: HTMLElement,
  point: { node: Node; offset: number },
  excludeStructural = false,
): number {
  if (point.node.nodeType !== Node.TEXT_NODE) {
    return 0;
  }
  if (point.offset !== (point.node.textContent ?? "").length) {
    return 0;
  }
  // Walk from the point to the end of the tree. Collect <br>s, but if a
  // non-empty text node follows the point's text node, the <br>s between
  // are not trailing — they're mid-document breaks. A `​` caret anchor is
  // not content (it's transient and stripped before the next insert), so it
  // doesn't count as "text after".
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
  walker.currentNode = point.node;
  const brs: Element[] = [];
  let sawTextAfter = false;
  let next = walker.nextNode();
  while (next) {
    if (hasContent(next)) {
      sawTextAfter = true;
      break;
    }
    if (next.nodeType === Node.ELEMENT_NODE && next.nodeName === "BR") {
      brs.push(next as Element);
    }
    next = walker.nextNode();
  }
  if (sawTextAfter || brs.length === 0) {
    return 0;
  }
  if (excludeStructural && isStructuralTrailingBr(brs[brs.length - 1], root)) {
    return brs.length - 1;
  }
  return brs.length;
}

/** Cached geometry values for an editor element, avoiding repeated
 *  `getComputedStyle` calls on every measurement. */
interface GeomCache {
  padding: number;
  lineHeight: number;
}

/** Read padding and line-height from computed style, with fallbacks. */
function readGeomCache(editorEl: HTMLElement): GeomCache {
  const style = getComputedStyle(editorEl);
  const padding = parseInt(style.paddingLeft, 10) || FALLBACK_PADDING;
  const lineHeight = parseFloat(style.lineHeight);
  return {
    padding,
    lineHeight: Number.isFinite(lineHeight) ? lineHeight : 22.75,
  };
}

export function useCaretOverlay(
  editorRef: RefObject<HTMLElement | null>,
  adapter: EditorAdapter | null,
  interim: string,
): { pos: CaretOverlayPos | null; remeasure: () => void } {
  const [pos, setPos] = useState<CaretOverlayPos | null>(null);
  const cacheRef = useRef<GeomCache>({
    padding: FALLBACK_PADDING,
    lineHeight: 22.75,
  });

  const measure = useCallback(() => {
    const el = editorRef.current;
    if (!el || !adapter) {
      return;
    }
    cacheRef.current = readGeomCache(el);
    setPos(resolveCaretPos(el, adapter, cacheRef.current));
  }, [editorRef, adapter]);

  // selectionchange fires on every keystroke; offsetToPoint walks a TreeWalker
  // on each call, so coalesce bursts into one measurement per animation frame.
  // Skip when the selection is outside the editor — the adapter clamps reads
  // to end-of-content, but re-measuring on every unrelated selection change
  // (clicking a side panel, a toolbar button, any input) is unnecessary work.
  useEffect(() => {
    let raf = 0;
    const onSelectionChange = () => {
      const el = editorRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (
        sel &&
        sel.rangeCount > 0 &&
        !el.contains(sel.getRangeAt(0).commonAncestorContainer)
      ) {
        return;
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [measure, editorRef]);

  // Measure on mount/adapter change, and whenever interim turns non-empty —
  // after a final insert that grew the document but didn't move the DOM
  // selection (focus on the mic button), the clamp resolves to the new
  // end-of-content, so the next interim preview snaps to where it will land.
  // Routed through the same RAF coalescing as selectionchange so bursts of
  // interim updates don't double the work.
  useEffect(() => {
    if (!interim) return;
    const el = editorRef.current;
    if (!el) return;
    let raf = requestAnimationFrame(() => {
      raf = 0;
      measure();
    });
    return () => cancelAnimationFrame(raf);
  }, [interim, measure, editorRef]);

  useEffect(() => {
    measure();
  }, [measure]);

  return { pos, remeasure: measure };
}

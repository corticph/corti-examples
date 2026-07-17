/**
 * Tracks the most-recently-focused editable control within a container and
 * exposes it as an EditorAdapter. "Sticky": it remembers the last editor even
 * after focus moves to a non-editable element (e.g. clicking the dictation mic
 * button), so dictation and commands still target where the user was typing.
 *
 * This is the core of "speech-enable whatever control is active" — the same
 * pattern a desktop integration uses to dictate into the focused field.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createContentEditableAdapter,
  createTextareaAdapter,
  type EditorAdapter,
} from "./editor-adapter";

/** Resolve an event target to the editable host element, if any. */
function editableHost(node: EventTarget | null): HTMLElement | null {
  let el = node instanceof HTMLElement ? node : null;
  if (!el && node instanceof Node && node.parentElement) {
    el = node.parentElement;
  }
  if (!el) {
    return null;
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el;
  }
  const editable = el.closest<HTMLElement>("[contenteditable='true']");
  return editable ?? null;
}

function adapterFor(el: HTMLElement | null): EditorAdapter | null {
  if (!el) {
    return null;
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return createTextareaAdapter(el);
  }
  if (el.isContentEditable) {
    return createContentEditableAdapter(el);
  }
  return null;
}

export interface ActiveControl {
  /** The active editor adapter, or null if no editable control has been focused. */
  adapter: EditorAdapter | null;
  /** The underlying element (for testing / labelling). */
  element: HTMLElement | null;
}

export function useActiveControl(containerRef: React.RefObject<HTMLElement>): ActiveControl {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const remember = useCallback((el: HTMLElement | null) => {
    if (el && el !== elementRef.current) {
      elementRef.current = el;
      setElement(el);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const onFocusIn = (e: FocusEvent) => remember(editableHost(e.target));
    container.addEventListener("focusin", onFocusIn);
    // Seed with the first editable control already present, if any.
    const first = container.querySelector<HTMLElement>("textarea, input, [contenteditable='true']");
    if (first) {
      remember(first);
    }
    return () => container.removeEventListener("focusin", onFocusIn);
  }, [containerRef, remember]);

  const adapter = useMemo(() => adapterFor(element), [element]);
  return { adapter, element };
}

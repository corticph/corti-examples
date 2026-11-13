/**
 * Undo/redo for the suite editor.
 *
 * WHY AN APP-LEVEL STACK AND NOT NATIVE Cmd+Z: the editor is deliberately
 * uncontrolled, and every programmatic writer — dictation insertion, voice
 * command actions, the cleanup agent — mutates the DOM imperatively through
 * `Range.deleteContents()` / `insertNode()`. Raw DOM mutation does NOT enter the
 * browser's undo stack; only real user input and `execCommand` do. So native
 * Cmd+Z could undo typing and formatting but silently did nothing for a
 * dictated segment, a voice command, or a whole-document cleanup rewrite — the
 * three ways this editor actually loses text.
 *
 * Routing those writes through `execCommand` instead would restore native undo,
 * but `execCommand` acts on the real document selection, which would force the
 * adapter to focus the editor and move the caret on every write and undo the
 * deliberate no-focus-steal behaviour in `insertTextAtSelection`. Owning the
 * history here keeps that intact and covers every writer with one mechanism.
 *
 * WHY A MutationObserver: same reason draftStore uses one — it is the only
 * subscription that sees all of them, typing included. See draftStore.ts.
 *
 * GRANULARITY: mutations are coalesced into one step per burst of quiet, so a
 * run of typing or a dictated segment is a single undo, not one per character.
 * `checkpoint()` forces a boundary before a programmatic rewrite so it can be
 * undone on its own.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { offsetToPoint, pointToOffset } from "../_shared/editorAdapter";

/** Quiet period that ends one undo step. */
const COALESCE_MS = 450;
/** Cap on retained steps; each holds the editor's full markup. */
const MAX_STEPS = 100;

interface Snapshot {
  html: string;
  /** Selection at the time this state was current, as text offsets. */
  start: number;
  end: number;
}

export interface EditorHistory {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /**
   * End the current step now, so the next change is undoable separately. Call
   * before a programmatic rewrite (cleanup, a voice command) that shouldn't be
   * merged into whatever the user was typing a moment ago.
   */
  checkpoint: () => void;
  /**
   * Discard all history and re-read the editor as the new baseline. For when the
   * document is replaced wholesale rather than edited — switching API client,
   * where the restored draft belongs to a different tenant.
   */
  rebase: () => void;
}

function readSelection(el: HTMLElement): { start: number; end: number } {
  const sel = window.getSelection();
  const length = el.textContent?.length ?? 0;
  if (!sel || sel.rangeCount === 0) {
    return { start: length, end: length };
  }
  const range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) {
    return { start: length, end: length };
  }
  return {
    start: pointToOffset(el, range.startContainer, range.startOffset),
    end: pointToOffset(el, range.endContainer, range.endOffset),
  };
}

function read(el: HTMLElement): Snapshot {
  return { html: el.innerHTML, ...readSelection(el) };
}

function restoreSelection(el: HTMLElement, snapshot: Snapshot) {
  const sel = window.getSelection();
  if (!sel) {
    return;
  }
  try {
    const from = offsetToPoint(el, snapshot.start);
    const to = offsetToPoint(el, snapshot.end);
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // A snapshot's offsets always fit its own markup, but never let a caret
    // failure abort the far more important content restore.
  }
}

/**
 * Undo/redo over `elRef`'s content.
 *
 * The hook must be declared AFTER `useDraftPersistence` in the component: effect
 * order is declaration order, so the draft is restored from storage before this
 * observer attaches, and the restore isn't mistaken for an edit the user can
 * undo back to an empty editor.
 */
export function useEditorHistory(elRef: React.RefObject<HTMLElement | null>): EditorHistory {
  const undoRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  /** The state currently in the editor, with the selection it was left at. */
  const currentRef = useRef<Snapshot | null>(null);
  const timerRef = useRef<number | null>(null);
  /** Suppresses the mutation our own undo/redo write produces. */
  const applyingRef = useRef(false);
  /**
   * Mirrors the stack depths into render state. The stacks themselves stay in
   * refs so the observer and key handler never need fresh closures; this is what
   * makes the toolbar's enabled state re-render.
   */
  const [depths, setDepths] = useState({ undo: 0, redo: 0 });

  const syncDepths = () =>
    setDepths({ undo: undoRef.current.length, redo: redoRef.current.length });

  /** Fold any pending mutation into a completed step. */
  const commit = useCallback(() => {
    const el = elRef.current;
    if (!el || !currentRef.current) {
      return;
    }
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = read(el);
    if (next.html === currentRef.current.html) {
      // Selection-only movement isn't an undo step; keep it for the next one.
      currentRef.current = next;
      return;
    }
    undoRef.current = [...undoRef.current, currentRef.current].slice(-MAX_STEPS);
    // A fresh edit invalidates the redo branch, as everywhere else.
    redoRef.current = [];
    currentRef.current = next;
    syncDepths();
  }, [elRef]);

  const apply = useCallback(
    (snapshot: Snapshot) => {
      const el = elRef.current;
      if (!el) {
        return;
      }
      applyingRef.current = true;
      el.innerHTML = snapshot.html;
      el.focus();
      restoreSelection(el, snapshot);
      currentRef.current = { ...snapshot };
      // Release on the next task, once the observer has seen our own write.
      window.setTimeout(() => {
        applyingRef.current = false;
      }, 0);
      syncDepths();
    },
    [elRef],
  );

  const undo = useCallback(() => {
    // Land any in-progress typing as its own step first, so the first Cmd+Z
    // undoes what was just typed rather than skipping past it.
    commit();
    const previous = undoRef.current[undoRef.current.length - 1];
    if (!previous || !currentRef.current) {
      return;
    }
    undoRef.current = undoRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, currentRef.current];
    apply(previous);
  }, [apply, commit]);

  const redo = useCallback(() => {
    const next = redoRef.current[redoRef.current.length - 1];
    if (!next || !currentRef.current) {
      return;
    }
    redoRef.current = redoRef.current.slice(0, -1);
    undoRef.current = [...undoRef.current, currentRef.current];
    apply(next);
  }, [apply]);

  const rebase = useCallback(() => {
    const el = elRef.current;
    if (!el) {
      return;
    }
    undoRef.current = [];
    redoRef.current = [];
    currentRef.current = read(el);
    syncDepths();
  }, [elRef]);

  // Baseline + observer. Catches every writer: typing, dictation insertion,
  // command actions, cleanup, and "clear draft".
  useEffect(() => {
    const el = elRef.current;
    if (!el) {
      return;
    }
    if (!currentRef.current) {
      currentRef.current = read(el);
    }
    const observer = new MutationObserver(() => {
      if (applyingRef.current) {
        return;
      }
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(commit, COALESCE_MS);
    });
    observer.observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [elRef, commit]);

  // Keybindings, scoped to the editor so Cmd+Z inside a side-panel input keeps
  // that field's own native undo.
  useEffect(() => {
    const el = elRef.current;
    if (!el) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }
      const key = event.key.toLowerCase();
      const isRedo = (key === "z" && event.shiftKey) || key === "y";
      if (key !== "z" && key !== "y") {
        return;
      }
      // Always preventDefault: native undo can't see the programmatic writes,
      // so letting it also fire would replay a partial, inconsistent history.
      event.preventDefault();
      if (isRedo) {
        redo();
      } else {
        undo();
      }
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [elRef, undo, redo]);

  return {
    canUndo: depths.undo > 0,
    canRedo: depths.redo > 0,
    undo,
    redo,
    checkpoint: commit,
    rebase,
  };
}

/**
 * Draft persistence for the suite editor.
 *
 * THE BUG THIS FIXES: upstream, the dictated text lived only in the DOM of an
 * uncontrolled textarea/contenteditable inside an applet component. Navigating
 * (`/:workflow/:applet` swaps `<Demo key={applet.id} />`) unmounted that component and
 * the text was gone with no way to recover it. Here the editor's content is
 * mirrored to localStorage, so it survives navigation, reload, and closing the
 * tab.
 *
 * WHY A MutationObserver AND NOT `onInput`: the editor is deliberately
 * uncontrolled — dictation insertion, voice-command actions and the cleanup
 * agent all write through EditorAdapter, which mutates the DOM imperatively and
 * therefore fires NO `input` event. Observing mutations is the only way to catch
 * every writer with one subscription. Typing is covered too (it mutates the DOM
 * like everything else), so `onInput` would be redundant on top of this.
 *
 * Storage is namespaced per API client via the same ConfigStore seam the command
 * / replacement / term stores use, so switching tenant doesn't leak drafts
 * across environments.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ConfigStore,
  createLocalConfigStore,
  identityNamespace,
} from "../_shared/configStore";

const DRAFT_KEY = "suite.draft";
const SAVE_DEBOUNCE_MS = 400;

export interface Draft {
  /** innerHTML, so bold/italic formatting survives a reload too. */
  html: string;
  /** Plain text, kept only so a restore can be skipped when it's empty. */
  text: string;
  savedAt: number;
}

const EMPTY: Draft = { html: "", text: "", savedAt: 0 };

function read(store: ConfigStore): Draft {
  const draft = store.get<Draft>(DRAFT_KEY, EMPTY);
  // Guard against a hand-edited / older-shape entry.
  if (typeof draft?.html !== "string") {
    return EMPTY;
  }
  return draft;
}

export interface DraftPersistence {
  /** When the draft was last written, for the "saved" indicator. */
  savedAt: number | null;
  /** Wipe both the editor and the stored draft. */
  clear: () => void;
}

/**
 * Mirror `elRef`'s content to storage and restore it on mount.
 *
 * `clientId` / `tenant` select the namespace; when they change (auth resolving,
 * or switching tenant) the editor is re-seeded from that namespace's draft.
 */
export function useDraftPersistence(
  elRef: React.RefObject<HTMLElement | null>,
  clientId?: string,
  tenant?: string,
): DraftPersistence {
  const namespace = identityNamespace(clientId, tenant);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const storeRef = useRef<ConfigStore>(createLocalConfigStore(namespace));
  const timerRef = useRef<number | null>(null);
  /** Suppresses the save that our own restore would otherwise trigger. */
  const restoringRef = useRef(false);

  const flush = useCallback(() => {
    const el = elRef.current;
    if (!el) {
      return;
    }
    const draft: Draft = {
      html: el.innerHTML,
      text: el.textContent ?? "",
      savedAt: Date.now(),
    };
    storeRef.current.set(DRAFT_KEY, draft);
    setSavedAt(draft.savedAt);
  }, [elRef]);

  // Restore whenever the namespace changes (including the initial mount).
  useEffect(() => {
    storeRef.current = createLocalConfigStore(namespace);
    const el = elRef.current;
    if (!el) {
      return;
    }
    const draft = read(storeRef.current);
    // Don't clobber text the user already dictated into an empty editor while
    // auth was still resolving — only seed when the editor itself is empty.
    if (draft.html && !(el.textContent ?? "").trim()) {
      restoringRef.current = true;
      el.innerHTML = draft.html;
      setSavedAt(draft.savedAt || null);
      // Release on the next task, after the observer has seen the restore.
      window.setTimeout(() => {
        restoringRef.current = false;
      }, 0);
    } else {
      setSavedAt(draft.savedAt || null);
    }
  }, [namespace, elRef]);

  // Catch every writer: typing, dictation insertion, command actions, cleanup.
  useEffect(() => {
    const el = elRef.current;
    if (!el) {
      return;
    }
    const observer = new MutationObserver(() => {
      if (restoringRef.current) {
        return;
      }
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
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
        // Persist whatever was pending rather than dropping the last edit.
        flush();
      }
    };
  }, [elRef, flush]);

  // A tab close can beat the debounce; write synchronously on the way out.
  useEffect(() => {
    const onHide = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
        flush();
      }
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flush]);

  const clear = useCallback(() => {
    const el = elRef.current;
    if (el) {
      el.innerHTML = "";
    }
    storeRef.current.set(DRAFT_KEY, EMPTY);
    setSavedAt(null);
  }, [elRef]);

  return { savedAt, clear };
}

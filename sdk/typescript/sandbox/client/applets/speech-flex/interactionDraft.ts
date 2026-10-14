/**
 * Per-interaction draft persistence for the Speech Flex editor.
 *
 * Same mechanism as dictation-suite/draftStore.ts (MutationObserver + debounced
 * localStorage write), but namespaced per interaction so each visit keeps its
 * own dictation draft. The editor represents a patient chart: content is
 * scoped to the selected visit context and swaps when the visit changes.
 *
 * Transfer rules when the interaction changes:
 *   - **No visit → Visit (no draft):** unaffiliated text transfers to the
 *     visit's namespace; the global (no-visit) store is cleared so the text
 *     doesn't reappear when the visit is deselected.
 *   - **No visit → Visit (has draft):** unaffiliated text is saved to the
 *     global store (preserved for when the visit is deselected); the visit's
 *     draft is restored into the editor.
 *   - **Visit A → Visit B:** current text is saved to A's store, then B's
 *     draft is restored (or the editor is cleared if B has no draft).
 *   - **Visit → No visit:** current text is saved to the visit's store, then
 *     the global draft is restored (or the editor is cleared).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ConfigStore,
  createLocalConfigStore,
  identityNamespace,
} from "../_shared/configStore";

const DRAFT_KEY = "speech-flex.draft";
const SAVE_DEBOUNCE_MS = 400;

export interface Draft {
  html: string;
  text: string;
  savedAt: number;
}

const EMPTY: Draft = { html: "", text: "", savedAt: 0 };

function read(store: ConfigStore): Draft {
  const draft = store.get<Draft>(DRAFT_KEY, EMPTY);
  if (typeof draft?.html !== "string") {
    return EMPTY;
  }
  return draft;
}

function write(store: ConfigStore, html: string, text: string): Draft {
  const draft: Draft = { html, text, savedAt: Date.now() };
  store.set(DRAFT_KEY, draft);
  return draft;
}

export interface InteractionDraftPersistence {
  savedAt: number | null;
  clear: () => void;
}

/**
 * Mirror `elRef`'s content to storage, namespaced by client + tenant +
 * interactionId. Restores the draft when the interaction changes, with
 * transfer semantics for unaffiliated (no-visit) content.
 */
export function useInteractionDraft(
  elRef: React.RefObject<HTMLElement | null>,
  clientId?: string,
  tenant?: string,
  interactionId?: string | null,
): InteractionDraftPersistence {
  const namespace = interactionId
    ? `${identityNamespace(clientId, tenant)}:${interactionId}`
    : identityNamespace(clientId, tenant);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const storeRef = useRef<ConfigStore>(createLocalConfigStore(namespace));
  const timerRef = useRef<number | null>(null);
  const restoringRef = useRef(false);
  const prevNamespaceRef = useRef<string>(namespace);
  const prevInteractionIdRef = useRef<string | null | undefined>(interactionId);

  const flush = useCallback(() => {
    const el = elRef.current;
    if (!el) {
      return;
    }
    const draft = write(storeRef.current, el.innerHTML, el.textContent ?? "");
    setSavedAt(draft.savedAt);
  }, [elRef]);

  useEffect(() => {
    const el = elRef.current;
    const oldNamespace = prevNamespaceRef.current;
    const oldInteractionId = prevInteractionIdRef.current;
    const oldWasNoVisit = oldInteractionId === null || oldInteractionId === undefined;
    const hasContent = el ? (el.textContent ?? "").trim().length > 0 : false;
    const namespaceChanged = oldNamespace !== namespace;

    // Create the new store and read its draft.
    storeRef.current = createLocalConfigStore(namespace);

    if (!el) {
      prevNamespaceRef.current = namespace;
      prevInteractionIdRef.current = interactionId;
      return;
    }

    if (namespaceChanged) {
      const draft = read(storeRef.current);

      if (draft.html) {
        // New namespace has a saved draft — save current content to the old
        // store, then restore the draft into the editor.
        if (hasContent) {
          write(createLocalConfigStore(oldNamespace), el.innerHTML, el.textContent ?? "");
        }
        restoringRef.current = true;
        el.innerHTML = draft.html;
        setSavedAt(draft.savedAt || null);
        window.setTimeout(() => {
          restoringRef.current = false;
        }, 0);
      } else if (oldWasNoVisit && hasContent) {
        // Transfer: no draft for the new visit, but the editor has
        // unaffiliated text. Move it to the new visit's store and clear the
        // old (global) store so it doesn't reappear on deselection.
        createLocalConfigStore(oldNamespace).set(DRAFT_KEY, EMPTY);
        const d = write(storeRef.current, el.innerHTML, el.textContent ?? "");
        setSavedAt(d.savedAt);
      } else {
        // No draft, no transfer — save current content to the old store
        // and clear the editor.
        if (hasContent) {
          write(createLocalConfigStore(oldNamespace), el.innerHTML, el.textContent ?? "");
        }
        el.innerHTML = "";
        setSavedAt(null);
      }
    } else {
      // Same namespace (initial mount or re-render) — restore the draft only
      // if the editor is empty.
      const draft = read(storeRef.current);
      if (draft.html && !(el.textContent ?? "").trim()) {
        restoringRef.current = true;
        el.innerHTML = draft.html;
        setSavedAt(draft.savedAt || null);
        window.setTimeout(() => {
          restoringRef.current = false;
        }, 0);
      } else {
        setSavedAt(draft.savedAt || null);
      }
    }

    prevNamespaceRef.current = namespace;
    prevInteractionIdRef.current = interactionId;
  }, [namespace, elRef, interactionId]);

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
    observer.observe(el, { childList: true, characterData: true, subtree: true });
    return () => {
      observer.disconnect();
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        flush();
      }
    };
  }, [elRef, flush]);

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

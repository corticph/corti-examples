/**
 * Session-scoped in-memory state for applets.
 *
 * The store lives in module scope, so it **survives React unmount/remount**
 * (navigating between applets) but is **re-initialized on browser refresh or
 * server restart** (JS modules re-evaluate). This is the exact persistence
 * boundary the sandbox wants: content persists during an active session but
 * does not survive a page reload.
 *
 * `useSessionState` is a drop-in replacement for `useState` — same signature,
 * same setter semantics (value or updater function). Each field is namespaced
 * by the current applet id (provided via `AppletIdProvider`), so applets don't
 * collide with each other.
 *
 * Config that *should* survive refresh (templates, rules, agent ids) stays on
 * the existing `createLocalConfigStore` (localStorage) — this store is purely
 * in-memory.
 */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
} from "react";

const store = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

function buildKey(appletId: string, field: string): string {
  return `${appletId}\u0000${field}`;
}

function subscribeKey(key: string, callback: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(callback);
  return () => {
    const current = listeners.get(key);
    if (!current) {
      return;
    }
    current.delete(callback);
    if (current.size === 0) {
      listeners.delete(key);
    }
  };
}

const AppletIdContext = createContext<string>("");

export function AppletIdProvider({
  appletId,
  children,
}: {
  appletId: string;
  children: ReactNode;
}) {
  return <AppletIdContext.Provider value={appletId}>{children}</AppletIdContext.Provider>;
}

export function useSessionState<T>(
  field: string,
  init: T | (() => T),
): [T, (value: T | ((prev: T) => T)) => void] {
  const appletId = useContext(AppletIdContext);
  const key = buildKey(appletId, field);
  const initRef = useRef(init);
  initRef.current = init;

  const getSnapshot = useCallback(() => {
    if (!store.has(key)) {
      const initializer = initRef.current;
      store.set(key, typeof initializer === "function" ? (initializer as () => T)() : initializer);
    }
    return store.get(key) as T;
  }, [key]);

  const subscribe = useCallback((callback: () => void) => subscribeKey(key, callback), [key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = store.get(key) as T;
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
      store.set(key, resolved);
      const set = listeners.get(key);
      if (set) {
        set.forEach((l) => {
          l();
        });
      }
    },
    [key],
  );

  return [value, setValue];
}

/** Remove all session state for a given applet id (useful for resets/tests). */
export function clearAppletState(appletId: string): void {
  const prefix = `${appletId}\u0000`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      listeners.delete(key);
    }
  }
}

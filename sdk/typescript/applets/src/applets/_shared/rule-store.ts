/**
 * Generic identity-namespaced store for a list of "rules" (replacements, terms,
 * …) — the same persistence pattern as the command store, factored for reuse.
 * User-created rules persist per API client (clientId:tenant) via the
 * ConfigStore seam; a preloaded catalog is always merged in and never removed.
 */
import { useSyncExternalStore } from "react";
import { type ConfigStore, createLocalConfigStore, identityNamespace } from "./config-store";

export interface RuleBase {
  id: string;
  /** Preloaded catalog rule (vs. user-created). */
  builtin?: boolean;
}

export interface RuleStore<T extends RuleBase> {
  useItems(): T[];
  /** Current items without subscribing (for non-React reads / tests). */
  getItems(): T[];
  upsert(item: T): void;
  removeMany(ids: string[]): void;
  setIdentity(clientId?: string, tenant?: string): void;
  newId(): string;
}

export function createRuleStore<T extends RuleBase>(
  storageKey: string,
  catalog: T[],
): RuleStore<T> {
  let namespace = "default";
  let store: ConfigStore = createLocalConfigStore(namespace);
  const loadUser = (): T[] => store.get<T[]>(storageKey, []);
  let items: T[] = [...catalog, ...loadUser()];
  let counter = 0;

  const listeners = new Set<() => void>();
  // biome-ignore lint/suspicious/useIterableCallbackReturn: forEach callbacks are void
  const emit = () => listeners.forEach((l) => l());
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const getSnapshot = () => items;
  const persist = () =>
    store.set(
      storageKey,
      items.filter((i) => !i.builtin),
    );

  return {
    useItems: () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    getItems: () => items,
    upsert(item) {
      const idx = items.findIndex((i) => i.id === item.id);
      items = idx === -1 ? [...items, item] : items.map((i, n) => (n === idx ? item : i));
      persist();
      emit();
    },
    removeMany(ids) {
      const set = new Set(ids);
      items = items.filter((i) => i.builtin || !set.has(i.id));
      persist();
      emit();
    },
    setIdentity(clientId, tenant) {
      const ns = identityNamespace(clientId, tenant);
      if (ns === namespace) {
        return;
      }
      namespace = ns;
      store = createLocalConfigStore(ns);
      items = [...catalog, ...loadUser()];
      emit();
    },
    newId: () => `r${Date.now().toString(36)}${(counter++).toString(36)}`,
  };
}

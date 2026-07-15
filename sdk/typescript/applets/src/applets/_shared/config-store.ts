/**
 * Persistence seam for Sandbox configuration (commands, replacements, terms…).
 *
 * Config is associated with the **API client** — namespaced by `clientId:tenant`
 * (both available from auth/JWT, so no separate login). Today it persists to
 * localStorage; when the app is hosted internally, swap `createLocalConfigStore`
 * for a server-backed implementation of the same `ConfigStore` interface (keyed
 * by the same namespace) without touching the feature stores that consume it.
 */
export interface ConfigStore {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
}

/** Build the per-API-client namespace from auth config. */
export function identityNamespace(clientId?: string, tenant?: string): string {
  const id = (clientId || "anon").trim() || "anon";
  const t = (tenant || "default").trim() || "default";
  return `${t}:${id}`.replace(/[^A-Za-z0-9:_-]/g, "_");
}

export function createLocalConfigStore(namespace: string): ConfigStore {
  const prefix = `corti-examples:${namespace}:`;
  return {
    get(key, fallback) {
      try {
        if (typeof localStorage === "undefined") return fallback;
        const raw = localStorage.getItem(prefix + key);
        return raw ? (JSON.parse(raw) as typeof fallback) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(prefix + key, JSON.stringify(value));
      } catch {
        /* ignore quota / serialization errors */
      }
    },
  };
}

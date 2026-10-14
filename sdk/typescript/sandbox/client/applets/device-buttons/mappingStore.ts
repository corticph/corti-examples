/**
 * Identity-aware persistence for handheld-mic button mappings.
 *
 * The WebHID runtime state lives in the shared `dictation-device` singleton;
 * this module adds the same per-API-client localStorage pattern the other
 * configurable applets use. The app shell calls `configureButtonMappings` once
 * runtime config resolves; this module then hydrates the active namespace and
 * persists every subsequent mapping change from the shared device store.
 *
 * Two layers are persisted:
 * - Global mappings under `buttonMappings` (the source of truth).
 * - Per-applet overrides under `buttonMappings:overrides:${appletId}`.
 *
 * The write-through subscriber mirrors the global layer; overrides are
 * persisted individually via `saveOverride` (called by the store on each
 * `setButtonOverride`).
 */
import {
  type ConfigStore,
  createLocalConfigStore,
  identityNamespace,
} from "../_shared/configStore";
import { deviceStore, setActiveApplet, setGlobalMappings } from "../_shared/dictationDevice";
import { BUTTON_BIT, type ButtonAction, type ButtonMappings } from "../_shared/hidRecording";

const MAPPINGS_KEY = "buttonMappings";
const OVERRIDES_KEY_PREFIX = "buttonMappings:overrides:";

export const DEFAULT_BUTTON_MAPPINGS: ButtonMappings = {
  [BUTTON_BIT.RECORD]: { type: "toggle" },
};

let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);
let loadedNamespace: string | null = null;
let subscribed = false;

/** Track the last-seen override state so the subscriber can detect changes. */
let lastOverrideBits: number[] = [];
let lastActiveApplet: string | null = null;

function overrideKey(appletId: string): string {
  return `${OVERRIDES_KEY_PREFIX}${appletId}`;
}

function ensurePersistenceSubscription() {
  if (subscribed) {
    return;
  }
  subscribed = true;
  deviceStore.subscribe(() => {
    if (loadedNamespace !== namespace) {
      return;
    }
    const snap = deviceStore.getSnapshot();
    // Persist global mappings.
    store.set(MAPPINGS_KEY, snap.globalMappings);

    // Persist override changes: when the active applet's override bits or
    // active applet id change, write the full override set for that applet.
    const bitsChanged =
      snap.overrideBits !== lastOverrideBits || snap.activeAppletId !== lastActiveApplet;
    if (bitsChanged && lastActiveApplet) {
      // The previous active applet's overrides were already written on each
      // individual setButtonOverride call via the snapshot diff below. But
      // setButtonOverride doesn't call saveOverride directly (circular dep),
      // so we persist here: write the current override state for the active
      // applet on every store change.
    }
    // Persist overrides for the active applet on every snapshot change.
    // This is slightly wasteful (writes even when overrides didn't change)
    // but simple and correct.
    if (snap.activeAppletId) {
      const overrides: ButtonMappings = {};
      for (const bit of snap.overrideBits) {
        overrides[bit] = snap.mappings[bit];
      }
      store.set(overrideKey(snap.activeAppletId), overrides);
    }
    lastOverrideBits = snap.overrideBits;
    lastActiveApplet = snap.activeAppletId;
  });
}

/** Load persisted overrides for an applet (called on applet activation). */
export function loadOverrides(appletId: string): ButtonMappings {
  return store.get<ButtonMappings>(overrideKey(appletId), {});
}

/** Persist a single override change for an applet. */
export function saveOverride(appletId: string, bit: number, action: ButtonAction | null): void {
  if (loadedNamespace !== namespace) {
    return;
  }
  const current = store.get<ButtonMappings>(overrideKey(appletId), {});
  if (action) {
    current[bit] = action;
  } else {
    delete current[bit];
  }
  store.set(overrideKey(appletId), current);
}

/** Clear all overrides for an applet. */
export function clearOverrides(appletId: string): void {
  if (loadedNamespace !== namespace) {
    return;
  }
  store.set(overrideKey(appletId), {});
}

/**
 * List all applet ids that have persisted overrides (non-empty). Scans
 * localStorage directly — the ConfigStore interface has no enumeration.
 */
export function listOverrideApplets(): string[] {
  if (typeof localStorage === "undefined" || loadedNamespace !== namespace) {
    return [];
  }
  const fullPrefix = `corti-examples:${namespace}:${OVERRIDES_KEY_PREFIX}`;
  const found: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(fullPrefix)) {
      const appletId = key.slice(fullPrefix.length);
      if (appletId) {
        const overrides = store.get<ButtonMappings>(overrideKey(appletId), {});
        if (Object.keys(overrides).length > 0) {
          found.push(appletId);
        }
      }
    }
  }
  return found;
}

/**
 * Load all applet overrides at once. Returns a map of appletId → ButtonMappings
 * for applets that have non-empty overrides.
 */
export function listAllOverrides(): Record<string, ButtonMappings> {
  const result: Record<string, ButtonMappings> = {};
  for (const appletId of listOverrideApplets()) {
    result[appletId] = loadOverrides(appletId);
  }
  return result;
}

/**
 * Delete a single override for an applet directly from persistence. Used by
 * the standalone Device Buttons view to manage overrides for applets that
 * aren't currently active.
 */
export function deleteOverride(appletId: string, bit: number): void {
  if (loadedNamespace !== namespace) {
    return;
  }
  const current = store.get<ButtonMappings>(overrideKey(appletId), {});
  delete current[bit];
  store.set(overrideKey(appletId), current);
}

/**
 * Point button-mapping persistence at the current API client's namespace and
 * hydrate the shared device store from it.
 */
export function configureButtonMappings(clientId?: string, tenant?: string) {
  ensurePersistenceSubscription();
  const nextNamespace = identityNamespace(clientId, tenant);
  if (nextNamespace === loadedNamespace) {
    return;
  }
  namespace = nextNamespace;
  store = createLocalConfigStore(nextNamespace);
  loadedNamespace = nextNamespace;
  const stored = store.get<ButtonMappings | null>(MAPPINGS_KEY, null);
  setGlobalMappings(stored ?? DEFAULT_BUTTON_MAPPINGS);
}

/**
 * Activate an applet's override context: hydrate its overrides from
 * persistence and set the store's active applet id.
 */
export function activateAppletOverrides(appletId: string): void {
  if (loadedNamespace !== namespace) {
    return;
  }
  const overrides = loadOverrides(appletId);
  setActiveApplet(appletId, overrides);
}

/** Deactivate the applet override context: clear overrides and active applet. */
export function deactivateAppletOverrides(): void {
  setActiveApplet(null);
}

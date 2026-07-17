/**
 * Identity-aware persistence for handheld-mic button mappings.
 *
 * The WebHID runtime state lives in the shared `dictation-device` singleton;
 * this module adds the same per-API-client localStorage pattern the other
 * configurable applets use. The app shell calls `configureButtonMappings` once
 * runtime config resolves; this module then hydrates the active namespace and
 * persists every subsequent mapping change from the shared device store.
 */
import {
  type ConfigStore,
  createLocalConfigStore,
  identityNamespace,
} from "../_shared/configStore";
import { deviceStore, setButtonMappings } from "../_shared/dictationDevice";
import { BUTTON_BIT, type ButtonMappings } from "../_shared/hidRecording";

const MAPPINGS_KEY = "buttonMappings";

export const DEFAULT_BUTTON_MAPPINGS: ButtonMappings = {
  [BUTTON_BIT.RECORD]: { type: "toggle" },
};

let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);
let loadedNamespace: string | null = null;
let subscribed = false;

function ensurePersistenceSubscription() {
  if (subscribed) {
    return;
  }
  subscribed = true;
  deviceStore.subscribe(() => {
    if (loadedNamespace !== namespace) {
      return;
    }
    store.set(MAPPINGS_KEY, deviceStore.getSnapshot().mappings);
  });
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
  setButtonMappings(stored ?? DEFAULT_BUTTON_MAPPINGS);
}

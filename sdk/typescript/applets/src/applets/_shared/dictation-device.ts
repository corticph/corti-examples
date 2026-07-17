/**
 * Shared WebHID handheld-mic controller (Philips SpeechMike / Foot Control /
 * PowerMic, via the `dictation_support` library).
 *
 * This is a module-level singleton because WebHID exposes ONE device-permission
 * stream per page: a single `DictationDeviceManager` serves every dictation
 * surface in the app. The hooks in `useDictationDevice.ts` are thin React views
 * over this store; the actual device I/O, button edge-detection, and action
 * routing all live here so they happen exactly once.
 *
 * Each device button is mapped to an action (toggle/push recording, or a local
 * command). Recording surfaces (the `<corti-dictation>` / `<corti-ambient>`
 * wrappers) register a target via `registerRecordingTarget`; command consumers
 * register via `registerCommandHandler`. Button effects route to the
 * most-recently mounted target/handler — in practice the one visible applet —
 * mirroring how `useKeybindingPassthrough` drives the same methods from the
 * keyboard. Effects only fire while a recording surface is active (a SpeechMike
 * is the selected mic somewhere); learn mode and the live monitor work always.
 *
 * Browser support: Chromium only, secure context (localhost is fine). The store
 * degrades gracefully when WebHID is missing or the package fails to load.
 */
import {
  BUTTON_BIT,
  type ButtonAction,
  type ButtonMappings,
  buttonName,
  computeButtonEffects,
  pressedButtonBit,
} from "./hid-recording";

/** Out-of-the-box mapping: the Record button toggles recording. */
const DEFAULT_MAPPINGS: ButtonMappings = {
  [BUTTON_BIT.RECORD]: { type: "toggle" },
};

// Minimal structural types for the dynamically-imported package, so this module
// never forces `dictation_support` to load (or the WebHID `lib` types to
// resolve) at import time.
interface HidDeviceLike {
  vendorId?: number;
  productId?: number;
  productName?: string;
}
interface DictationDeviceLike {
  hidDevice: HidDeviceLike;
}
interface DictationDeviceManagerLike {
  init(): Promise<void>;
  shutdown(): Promise<void>;
  getDevices(): DictationDeviceLike[];
  requestDevice(): Promise<DictationDeviceLike[]>;
  addButtonEventListener(listener: (device: DictationDeviceLike, bitMask: number) => void): void;
  addDeviceConnectedEventListener(listener: (device: DictationDeviceLike) => void): void;
  addDeviceDisconnectedEventListener(listener: (device: DictationDeviceLike) => void): void;
}

export interface DeviceInfo {
  key: string;
  label: string;
  vendorId: number;
  productId: number;
}

export type SdkStatus = "unknown" | "available" | "missing";

export interface DeviceStoreState {
  /** WebHID is present in this browser (Chromium + secure context). */
  isAvailable: boolean;
  sdkStatus: SdkStatus;
  isInitialized: boolean;
  isRequesting: boolean;
  error: string | null;
  devices: DeviceInfo[];
  /** Button bit → action. */
  mappings: ButtonMappings;
  /** Capturing the next button press to add a mapping. */
  learning: boolean;
  /** Most recent button press, for the live UI indicator. */
  lastButton: { label: string; bit: number; at: number } | null;
}

export interface RecordingTarget {
  start(): void;
  stop(): void;
  toggle(): void;
}

/** Receives a command id when a command-mapped button is pressed (local). */
export type CommandHandler = (commandId: string) => void;

const isWebHidAvailable = () => typeof navigator !== "undefined" && "hid" in navigator;

/** Audio-device label tokens that identify a handheld dictation microphone. */
const HANDHELD_LABEL_RE = /speechmike|speech ?one|powermic|foot ?control|philips|grundig|nuance/i;

function deviceKey(hid: HidDeviceLike): string {
  return `${hid.vendorId ?? 0}:${hid.productId ?? 0}:${hid.productName ?? ""}`;
}

function toDeviceInfo(device: DictationDeviceLike): DeviceInfo | null {
  const hid = device?.hidDevice;
  if (!hid) {
    return null;
  }
  const vendorId = hid.vendorId ?? 0;
  const productId = hid.productId ?? 0;
  return {
    key: deviceKey(hid),
    label: hid.productName?.trim() || `Device ${vendorId}:${productId}`,
    vendorId,
    productId,
  };
}

// ---- Singleton store -------------------------------------------------------

let snapshot: DeviceStoreState = {
  isAvailable: isWebHidAvailable(),
  sdkStatus: "unknown",
  isInitialized: false,
  isRequesting: false,
  error: null,
  devices: [],
  mappings: DEFAULT_MAPPINGS,
  learning: false,
  lastButton: null,
};

const listeners = new Set<() => void>();
const targets: RecordingTarget[] = [];
const commandHandlers: CommandHandler[] = [];
const prevMaskByKey = new Map<string, number>();

let manager: DictationDeviceManagerLike | null = null;
let initPromise: Promise<void> | null = null;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function patch(next: Partial<DeviceStoreState>) {
  snapshot = { ...snapshot, ...next };
  emit();
}

function dispatchRecord(op: "start" | "stop" | "toggle") {
  const target = targets[targets.length - 1];
  if (!target) {
    return;
  }
  if (op === "start") {
    target.start();
  } else if (op === "stop") {
    target.stop();
  } else {
    target.toggle();
  }
}

function dispatchCommand(commandId: string) {
  commandHandlers[commandHandlers.length - 1]?.(commandId);
}

function refreshDevices() {
  if (!manager) {
    return;
  }
  try {
    const found = manager.getDevices() ?? [];
    const devices = found.map(toDeviceInfo).filter((d): d is DeviceInfo => Boolean(d));
    patch({ devices });
  } catch (err) {
    patch({
      error: err instanceof Error ? err.message : "Failed to read devices",
    });
  }
}

function handleButtonEvent(device: DictationDeviceLike, bitMask: number) {
  const hid = device?.hidDevice;
  if (!hid) {
    return;
  }
  const key = deviceKey(hid);
  const prev = prevMaskByKey.get(key) ?? 0;
  const next = bitMask >>> 0;
  prevMaskByKey.set(key, next);

  const pressedBit = pressedButtonBit(prev, next);
  if (pressedBit) {
    patch({
      lastButton: {
        label: buttonName(pressedBit),
        bit: pressedBit,
        at: nowMs(),
      },
    });
  }

  // Learn mode: capture the first newly-pressed button as a new mapping.
  if (snapshot.learning) {
    if (pressedBit) {
      const action: ButtonAction = snapshot.mappings[pressedBit] ?? {
        type: "toggle",
      };
      patch({
        mappings: { ...snapshot.mappings, [pressedBit]: action },
        learning: false,
      });
    }
    return;
  }

  // Effects fire only when a recording surface is active (SpeechMike selected).
  if (!targets.length) {
    return;
  }
  for (const effect of computeButtonEffects(prev, next, snapshot.mappings)) {
    if (effect.kind === "record") {
      dispatchRecord(effect.op);
    } else {
      dispatchCommand(effect.commandId);
    }
  }
}

// `Date.now()` indirected so it's the only timestamp source (easy to stub).
function nowMs(): number {
  return Date.now();
}

async function ensureInit(): Promise<void> {
  if (!snapshot.isAvailable) {
    return;
  }
  if (manager) {
    return;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    let mod: { DictationDeviceManager: new () => DictationDeviceManagerLike };
    try {
      mod = (await import("dictation_support")) as unknown as {
        DictationDeviceManager: new () => DictationDeviceManagerLike;
      };
    } catch {
      patch({
        sdkStatus: "missing",
        error: "dictation_support failed to load. Run npm install and reload.",
      });
      initPromise = null;
      return;
    }
    patch({ sdkStatus: "available" });
    const instance = new mod.DictationDeviceManager();
    instance.addButtonEventListener(handleButtonEvent);
    instance.addDeviceConnectedEventListener(() => refreshDevices());
    instance.addDeviceDisconnectedEventListener((device) => {
      const hid = device?.hidDevice;
      if (hid) {
        prevMaskByKey.delete(deviceKey(hid));
      }
      refreshDevices();
    });
    try {
      await instance.init(); // reconnects already-granted devices
      manager = instance;
      patch({ isInitialized: true, error: null });
      refreshDevices();
    } catch (err) {
      patch({
        error: err instanceof Error ? err.message : "Failed to initialize device manager",
      });
      initPromise = null;
    }
  })();

  return initPromise;
}

// ---- Public API ------------------------------------------------------------

export const deviceStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): DeviceStoreState {
    return snapshot;
  },
};

export function setButtonMappings(mappings: ButtonMappings) {
  patch({ mappings });
}

/** Begin capturing the next button press as a new mapping. */
export function startLearning() {
  if (snapshot.isAvailable) {
    patch({ learning: true });
  }
}

export function cancelLearning() {
  if (snapshot.learning) {
    patch({ learning: false });
  }
}

/**
 * Prompt the browser's device picker and connect. Must be called from a user
 * gesture (a click) — WebHID requires it.
 */
export async function requestDevice(): Promise<void> {
  if (!snapshot.isAvailable) {
    return;
  }
  await ensureInit();
  if (!manager) {
    return;
  }
  patch({ isRequesting: true, error: null });
  try {
    await manager.requestDevice();
    refreshDevices();
  } catch (err) {
    patch({
      error: err instanceof Error ? err.message : "Failed to request device",
    });
  } finally {
    patch({ isRequesting: false });
  }
}

/** Connect to any previously-granted devices without showing the picker. */
export function initDeviceManager(): void {
  void ensureInit();
}

/**
 * Whether an audio-input label looks like a handheld dictation microphone
 * (SpeechMike / SpeechOne / PowerMic / Foot Control). Pure label check — used to
 * pick the default mic regardless of whether WebHID has been granted yet.
 */
export function isHandheldMicLabel(label?: string): boolean {
  return Boolean(label) && HANDHELD_LABEL_RE.test(label as string);
}

/**
 * Whether the audio input currently selected in a recording surface belongs to
 * a connected handheld dictation device. This is the gate for activating button
 * control: it requires BOTH a connected HID device and a matching selected mic,
 * so the buttons stay inert while a built-in / regular mic is in use.
 */
export function isHandheldMicSelected(selectedLabel?: string): boolean {
  if (!snapshot.devices.length || !selectedLabel) {
    return false;
  }
  if (HANDHELD_LABEL_RE.test(selectedLabel)) {
    return true;
  }
  const lower = selectedLabel.toLowerCase();
  return snapshot.devices.some(
    (device) => device.label && lower.includes(device.label.toLowerCase()),
  );
}

/**
 * Register a recording surface. Button presses route to the most-recently
 * registered (mounted) target. Returns an unregister function.
 */
export function registerRecordingTarget(target: RecordingTarget): () => void {
  targets.push(target);
  return () => {
    const index = targets.lastIndexOf(target);
    if (index >= 0) {
      targets.splice(index, 1);
    }
  };
}

/**
 * Register a consumer for command-mapped button presses (e.g. an applet that
 * dispatches the command id locally against its editor). Most-recently
 * registered handler wins. Returns an unregister function.
 */
export function registerCommandHandler(handler: CommandHandler): () => void {
  commandHandlers.push(handler);
  return () => {
    const index = commandHandlers.lastIndexOf(handler);
    if (index >= 0) {
      commandHandlers.splice(index, 1);
    }
  };
}

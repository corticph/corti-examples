/**
 * React views over the shared WebHID device store (`dictation-device.ts`).
 *
 * - `useDictationDevice()` exposes store state + actions for the mapping UI.
 * - `useHidRecordingControl(ref)` registers a `<corti-dictation>` /
 *   `<corti-ambient>` element as the recording target, so mapped buttons drive
 *   it — the HID sibling of `useKeybindingPassthrough`.
 * - `useHidCommandHandler(fn)` registers a consumer for command-mapped buttons.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  cancelLearning,
  type DeviceStoreState,
  deviceStore,
  initDeviceManager,
  isHandheldMicLabel,
  isHandheldMicSelected,
  registerCommandHandler,
  registerRecordingTarget,
  requestDevice,
  setButtonMappings,
  startLearning,
} from "./dictationDevice";
import type { ButtonMappings } from "./hidRecording";

export interface UseDictationDevice extends DeviceStoreState {
  requestDevice: () => Promise<void>;
  setMappings: (mappings: ButtonMappings) => void;
  startLearning: () => void;
  cancelLearning: () => void;
}

export function useDictationDevice(): UseDictationDevice {
  const state = useSyncExternalStore(
    deviceStore.subscribe,
    deviceStore.getSnapshot,
    deviceStore.getSnapshot,
  );
  return {
    ...state,
    requestDevice,
    setMappings: setButtonMappings,
    startLearning,
    cancelLearning,
  };
}

/**
 * Register a handler that runs when a command-mapped button is pressed. The
 * handler receives the mapped command id; an applet typically dispatches it
 * locally against its editor (the API does not execute button commands).
 */
export function useHidCommandHandler(handler: (commandId: string) => void): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  }, [handler]);
  useEffect(() => registerCommandHandler((id) => ref.current(id)), []);
}

/**
 * A Corti recording surface (`<corti-dictation>` / `<corti-ambient>`, both
 * `CortiRoot`): imperative start/stop/toggle plus the currently selected mic.
 */
interface AudioDevice {
  label?: string;
}
interface RecordingSurface {
  startRecording(): void;
  stopRecording(): void;
  toggleRecording(): void;
  devices?: AudioDevice[];
  selectedDevice?: AudioDevice;
  addEventListener: HTMLElement["addEventListener"];
  removeEventListener: HTMLElement["removeEventListener"];
}

/**
 * Make the handheld-mic buttons drive this recording surface — but ONLY while
 * the surface has the handheld device selected as its microphone (mirrors the
 * keyboard passthrough, gated on mic selection). Selecting a built-in mic from
 * the surface's device dropdown leaves the buttons inert; selecting the
 * SpeechMike activates them. `enabled` is the master opt-out.
 */
export function useHidRecordingControl(
  ref: React.RefObject<RecordingSurface | null>,
  enabled = true,
): void {
  // Subscribe so activation re-evaluates when a device connects/disconnects.
  const { devices } = useDictationDevice();
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>();
  const autoSelectedRef = useRef(false);

  // Reconnect already-granted devices on mount (idempotent; shows no picker).
  useEffect(() => {
    initDeviceManager();
  }, []);

  // Default this surface's microphone to a handheld device when one is present,
  // instead of the built-in mic. Applied at most once while a handheld mic is
  // available, so a manual switch afterward sticks; re-arms if it disappears.
  const defaultToHandheldMic = useCallback(
    (el: RecordingSurface | null) => {
      if (!enabled || !el) {
        return;
      }
      const handheld = (el.devices ?? []).find((d) => isHandheldMicLabel(d.label));
      if (!handheld) {
        autoSelectedRef.current = false;
        return;
      }
      if (autoSelectedRef.current) {
        return;
      }
      autoSelectedRef.current = true;
      if (!isHandheldMicLabel(el.selectedDevice?.label)) {
        el.selectedDevice = handheld;
        setSelectedLabel(handheld.label);
      }
    },
    [enabled],
  );

  // Track which microphone this surface currently has selected.
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    setSelectedLabel(el.selectedDevice?.label);
    defaultToHandheldMic(el);
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ selectedDevice?: { label?: string } }>).detail;
      setSelectedLabel(detail?.selectedDevice?.label);
      defaultToHandheldMic(el);
    };
    el.addEventListener("recording-devices-changed", handler);
    return () => el.removeEventListener("recording-devices-changed", handler);
  }, [ref, defaultToHandheldMic]);

  const active = useMemo(
    () => enabled && isHandheldMicSelected(selectedLabel),
    // `devices` participates: isHandheldMicSelected reads the connected set.
    [enabled, selectedLabel, devices],
  );

  useEffect(() => {
    if (!active) {
      return;
    }
    return registerRecordingTarget({
      start: () => ref.current?.startRecording(),
      stop: () => ref.current?.stopRecording(),
      toggle: () => ref.current?.toggleRecording(),
    });
  }, [ref, active]);
}

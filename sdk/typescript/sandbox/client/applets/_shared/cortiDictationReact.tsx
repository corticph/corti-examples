/**
 * React wrapper for the <corti-dictation> Lit web component (@corti/dictation-web).
 *
 * @lit/react's createComponent maps the custom element's DOM CustomEvents onto
 * React-style onX props with typed event details, and lets React manage the
 * element's properties (e.g. dictationConfig, authConfig).
 */

import type {
  AudioEventEventDetail,
  AudioLevelChangedEventDetail,
  CommandEventDetail,
  DeltaUsageEventDetail,
  ErrorEventDetail,
  KeybindingChangedEventDetail,
  LanguagesChangedEventDetail,
  NetworkActivityEventDetail,
  RecordingDevicesChangedEventDetail,
  RecordingStateChangedEventDetail,
  TranscriptEventDetail,
  UsageEventDetail,
} from "@corti/dictation-web";
import { CortiDictation } from "@corti/dictation-web";
import { createComponent, type EventName } from "@lit/react";
import * as React from "react";
import { useSessionStatus } from "../../context/SessionStatusContext";
import { EXAMPLES_ANALYTICS } from "./examplesAnalytics";
import { useHidRecordingControl } from "./useDictationDevice";

const CortiDictationElement = createComponent({
  react: React,
  tagName: "corti-dictation",
  elementClass: CortiDictation,
  events: {
    onTranscript: "transcript" as EventName<CustomEvent<TranscriptEventDetail>>,
    onCommand: "command" as EventName<CustomEvent<CommandEventDetail>>,
    onRecordingStateChanged: "recording-state-changed" as EventName<
      CustomEvent<RecordingStateChangedEventDetail>
    >,
    onRecordingDevicesChanged: "recording-devices-changed" as EventName<
      CustomEvent<RecordingDevicesChangedEventDetail>
    >,
    onLanguagesChanged: "languages-changed" as EventName<CustomEvent<LanguagesChangedEventDetail>>,
    onAudioLevelChanged: "audio-level-changed" as EventName<
      CustomEvent<AudioLevelChangedEventDetail>
    >,
    onAudioEvent: "audio-event" as EventName<CustomEvent<AudioEventEventDetail>>,
    onUsage: "usage" as EventName<CustomEvent<UsageEventDetail>>,
    onDeltaUsage: "delta-usage" as EventName<CustomEvent<DeltaUsageEventDetail>>,
    onKeybindingChanged: "keybinding-changed" as EventName<
      CustomEvent<KeybindingChangedEventDetail>
    >,
    onError: "error" as EventName<CustomEvent<ErrorEventDetail>>,
    onReady: "ready" as EventName<CustomEvent<void>>,
  },
});

/**
 * Default keybindings applied to every dictation surface. The web component
 * otherwise auto-assigns Space = push-to-talk and Enter = toggle-to-talk the
 * moment its keybinding selector mounts — and its keyup handler is NOT guarded
 * against typing in inputs, so a typed Space would stop recording mid-dictation.
 * Backtick (push-to-talk) and tilde / shift+backtick (toggle-to-talk) don't
 * collide with normal text, so typing and dictation coexist. Callers can still
 * override per usage, and the user can re-bind via the selector.
 */
export const DEFAULT_PUSH_TO_TALK_KEY = "`";
export const DEFAULT_TOGGLE_TO_TALK_KEY = "~";

type CortiDictationProps = Omit<
  React.ComponentProps<typeof CortiDictationElement>,
  "dictationConfig"
> & {
  /** Let the handheld-mic Record button drive this surface (default true). */
  hidRecordingControl?: boolean;
  /**
   * Dictation config. Accepts the app-level SDK v6 TranscribeConfig; the
   * underlying @corti/dictation-web component receives it as a plain object
   * and sends it as JSON. An npm override forces @corti/sdk@^6 for the web
   * component too, so its serializer natively supports wildcard variables.
   */
  dictationConfig?: unknown;
};

const SETTINGS_POPOVER_VIEWPORT_FIX = `
  [popover] {
    position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline !important;
    max-height: calc(100dvh - 16px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
`;

/**
 * @corti/dictation-web 0.7.0 only flips its anchored settings popover inline
 * (its own adopted stylesheet sets `position-try-fallbacks: flip-inline` on
 * the same `[popover]` selector). Since both rules have identical specificity,
 * the library's adopted stylesheet wins that declaration regardless of DOM
 * order — `!important` is required to actually override it, not just append a
 * plain `<style>` tag. Without the block-axis fallback, a trigger near the
 * bottom of the viewport (e.g. the rich-text applet's toolbar) opens the menu
 * downward and it runs off-screen.
 */
async function installSettingsPopoverViewportFix(
  element: InstanceType<typeof CortiDictation>,
): Promise<void> {
  await element.updateComplete;

  const settingsMenu = element.shadowRoot?.querySelector("dictation-settings-menu") as
    | (HTMLElement & { updateComplete?: Promise<unknown> })
    | null;
  if (!settingsMenu) {
    return;
  }

  await settingsMenu.updateComplete;
  if (!settingsMenu.shadowRoot?.querySelector("style[data-viewport-fix]")) {
    const style = document.createElement("style");
    style.dataset.viewportFix = "";
    style.textContent = SETTINGS_POPOVER_VIEWPORT_FIX;
    settingsMenu.shadowRoot?.append(style);
  }
}

function isEditable(el: Element | null): boolean {
  if (!el) {
    return false;
  }
  const tag = el.tagName;
  return (
    tag === "INPUT" || tag === "TEXTAREA" || (el instanceof HTMLElement && el.isContentEditable)
  );
}

/** Match a KeyboardEvent against a single-key keybinding (e.g. "`", "~", "Space"). */
function keyMatches(e: KeyboardEvent, keybinding: string | null | undefined) {
  if (!keybinding) {
    return false;
  }
  if (keybinding === "Space") {
    return e.key === " ";
  }
  return e.key.toLowerCase() === keybinding.toLowerCase();
}

interface KeybindingRefs {
  push: React.RefObject<string | null>;
  toggle: React.RefObject<string | null>;
}

/**
 * The web component's keybinding controller intentionally ignores keystrokes
 * while a field is focused, so you can type — which means the push/toggle keys
 * just get typed into the field. This hook closes that gap for OUR keybindings:
 * while an editable control is focused, it intercepts the push-to-talk / toggle
 * key, prevents it being typed, and drives recording on the element directly.
 * (When focus is NOT in a field, the component's own controller handles it, so
 * the two never both fire on keydown.) The matched keys come from `keys`, which
 * the wrapper keeps in sync with the component's `keybinding-changed` event — so
 * re-binding via the selector UI immediately updates what's intercepted here.
 */
function useKeybindingPassthrough(
  ref: React.RefObject<InstanceType<typeof CortiDictation> | null>,
  keys: KeybindingRefs,
) {
  React.useEffect(() => {
    const pressed = { current: false };
    const onKeyDown = (e: KeyboardEvent) => {
      const el = ref.current;
      if (!el || !isEditable(document.activeElement)) {
        return;
      }
      // Always preventDefault a matched key — INCLUDING auto-repeat while held —
      // so the push-to-talk key never types into the field; only trigger the
      // recording action on the first (non-repeat) press.
      if (keyMatches(e, keys.toggle.current)) {
        e.preventDefault();
        if (!e.repeat) {
          el.toggleRecording();
        }
      } else if (keyMatches(e, keys.push.current)) {
        e.preventDefault();
        if (!e.repeat && !pressed.current) {
          pressed.current = true;
          el.startRecording();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const el = ref.current;
      if (el && pressed.current && keyMatches(e, keys.push.current)) {
        pressed.current = false;
        el.stopRecording();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [ref, keys]);
}

/**
 * The /transcribe session id only ever arrives inside the raw CONFIG_ACCEPTED
 * message — the component doesn't re-expose it as its own typed event, but it
 * does dispatch every raw inbound/outbound WS message as `network-activity`.
 * Surfacing it here (rather than per-applet) means every dictation-based
 * applet gets the shared footer's troubleshooting id for free.
 */
function useSessionIdCapture(ref: React.RefObject<InstanceType<typeof CortiDictation> | null>) {
  const { setStatus, clear } = useSessionStatus();
  React.useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const onNetworkActivity = (e: Event) => {
      const detail = (e as CustomEvent<NetworkActivityEventDetail>).detail;
      if (detail?.direction !== "received") {
        return;
      }
      const data = detail.data as { type?: string; sessionId?: string } | undefined;
      if (data?.type === "CONFIG_ACCEPTED" && data.sessionId) {
        setStatus({ sessionId: data.sessionId });
      }
    };
    el.addEventListener("network-activity", onNetworkActivity);
    return () => {
      el.removeEventListener("network-activity", onNetworkActivity);
      clear();
    };
  }, [ref, setStatus, clear]);
}

export const CortiDictationComponent = React.forwardRef<
  InstanceType<typeof CortiDictation>,
  CortiDictationProps
>(function CortiDictationComponent(props, forwardedRef) {
  const { onKeybindingChanged, onError, hidRecordingControl = true, ...rest } = props;
  const innerRef = React.useRef<InstanceType<typeof CortiDictation> | null>(null);

  // The web component dispatches "error" events with bubbles:false (events.js),
  // so @lit/react's bubble-phase listener never fires. A capture-phase listener
  // on the host element still receives composed events regardless of bubbling.
  const onErrorRef = React.useRef(onError);
  React.useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  React.useEffect(() => {
    const el = innerRef.current;
    if (!el) {
      return;
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ErrorEventDetail>).detail;
      console.error("[corti-dictation]", detail?.message ?? "Unknown error");
      onErrorRef.current?.(e as CustomEvent<ErrorEventDetail>);
    };
    el.addEventListener("error", handler, true);
    return () => el.removeEventListener("error", handler, true);
  }, []);
  const setRef = React.useCallback(
    (el: InstanceType<typeof CortiDictation> | null) => {
      if (el) {
        (el as typeof el & { analytics?: Record<string, string> }).analytics = EXAMPLES_ANALYTICS;
      }
      innerRef.current = el;
      if (typeof forwardedRef === "function") {
        forwardedRef(el);
      } else if (forwardedRef) {
        forwardedRef.current = el;
      }
    },
    [forwardedRef],
  );

  // Locked keys, seeded from the (possibly overridden) defaults and kept in sync
  // with the component's keybinding-changed event when the user re-binds.
  const pushKeyRef = React.useRef(props.pushToTalkKeybinding ?? DEFAULT_PUSH_TO_TALK_KEY);
  const toggleKeyRef = React.useRef(props.toggleToTalkKeybinding ?? DEFAULT_TOGGLE_TO_TALK_KEY);
  const keys = React.useMemo(() => ({ push: pushKeyRef, toggle: toggleKeyRef }), []);
  useKeybindingPassthrough(innerRef, keys);
  useHidRecordingControl(innerRef, hidRecordingControl);
  useSessionIdCapture(innerRef);

  React.useEffect(() => {
    const element = innerRef.current;
    if (element) {
      void installSettingsPopoverViewportFix(element);
    }
  }, [rest.settingsEnabled]);

  const handleKeybindingChanged = React.useCallback(
    (e: CustomEvent<KeybindingChangedEventDetail>) => {
      const detail = e.detail;
      if (detail?.type === "push-to-talk") {
        pushKeyRef.current = detail.keybinding;
      } else if (detail?.type === "toggle-to-talk") {
        toggleKeyRef.current = detail.keybinding;
      }
      onKeybindingChanged?.(e);
    },
    [onKeybindingChanged],
  );

  return (
    <CortiDictationElement
      ref={setRef}
      pushToTalkKeybinding={DEFAULT_PUSH_TO_TALK_KEY}
      toggleToTalkKeybinding={DEFAULT_TOGGLE_TO_TALK_KEY}
      {...(rest as React.ComponentProps<typeof CortiDictationElement>)}
      onKeybindingChanged={handleKeybindingChanged}
    />
  );
});

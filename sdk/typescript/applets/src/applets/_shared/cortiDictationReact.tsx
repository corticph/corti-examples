/**
 * React wrapper for the <corti-dictation> Lit web component (@corti/dictation-web).
 *
 * @lit/react's createComponent maps the custom element's DOM CustomEvents onto
 * React-style onX props with typed event details, and lets React manage the
 * element's properties (e.g. dictationConfig, authConfig). Mirrors the pattern
 * used by corti-api-console.
 */

import type {
  AudioEventEventDetail,
  AudioLevelChangedEventDetail,
  CommandEventDetail,
  DeltaUsageEventDetail,
  ErrorEventDetail,
  KeybindingChangedEventDetail,
  LanguagesChangedEventDetail,
  RecordingDevicesChangedEventDetail,
  RecordingStateChangedEventDetail,
  TranscriptEventDetail,
  UsageEventDetail,
} from "@corti/dictation-web";
import { CortiDictation } from "@corti/dictation-web";
import { createComponent, type EventName } from "@lit/react";
import * as React from "react";
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

type CortiDictationProps = React.ComponentProps<typeof CortiDictationElement> & {
  /** Let the handheld-mic Record button drive this surface (default true). */
  hidRecordingControl?: boolean;
};

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

export const CortiDictationComponent = React.forwardRef<
  InstanceType<typeof CortiDictation>,
  CortiDictationProps
>(function CortiDictationComponent(props, forwardedRef) {
  const { onKeybindingChanged, hidRecordingControl = true, ...rest } = props;
  const innerRef = React.useRef<InstanceType<typeof CortiDictation> | null>(null);
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
      {...rest}
      onKeybindingChanged={handleKeybindingChanged}
    />
  );
});

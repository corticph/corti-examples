/**
 * React wrapper for the <corti-ambient> Lit web component (@corti/ambient-web).
 *
 * Like the dictation wrapper, but for /streams: adds the `facts` event and takes
 * `ambientConfig` (Corti.StreamConfig) + an `interactionId` property.
 */

import type {
  AudioEventEventDetail,
  AudioLevelChangedEventDetail,
  DeltaUsageEventDetail,
  ErrorEventDetail,
  FactsEventDetail,
  KeybindingChangedEventDetail,
  LanguagesChangedEventDetail,
  RecordingDevicesChangedEventDetail,
  RecordingStateChangedEventDetail,
  TranscriptEventDetail,
  UsageEventDetail,
  VirtualModeChangedEventDetail,
} from "@corti/ambient-web";
import { CortiAmbient } from "@corti/ambient-web";
import { createComponent, type EventName } from "@lit/react";
import * as React from "react";
import { useSessionStatus } from "../../context/SessionStatusContext";
import { useHidRecordingControl } from "./useDictationDevice";

const CortiAmbientElement = createComponent({
  react: React,
  tagName: "corti-ambient",
  elementClass: CortiAmbient,
  events: {
    onTranscript: "transcript" as EventName<CustomEvent<TranscriptEventDetail>>,
    onFacts: "facts" as EventName<CustomEvent<FactsEventDetail>>,
    onRecordingStateChanged: "recording-state-changed" as EventName<
      CustomEvent<RecordingStateChangedEventDetail>
    >,
    onRecordingDevicesChanged: "recording-devices-changed" as EventName<
      CustomEvent<RecordingDevicesChangedEventDetail>
    >,
    onLanguagesChanged: "languages-changed" as EventName<
      CustomEvent<LanguagesChangedEventDetail>
    >,
    onAudioLevelChanged: "audio-level-changed" as EventName<
      CustomEvent<AudioLevelChangedEventDetail>
    >,
    onAudioEvent: "audio-event" as EventName<
      CustomEvent<AudioEventEventDetail>
    >,
    onUsage: "usage" as EventName<CustomEvent<UsageEventDetail>>,
    onDeltaUsage: "delta-usage" as EventName<
      CustomEvent<DeltaUsageEventDetail>
    >,
    onVirtualModeChanged: "virtual-mode-changed" as EventName<
      CustomEvent<VirtualModeChangedEventDetail>
    >,
    onKeybindingChanged: "keybinding-changed" as EventName<
      CustomEvent<KeybindingChangedEventDetail>
    >,
    onError: "error" as EventName<CustomEvent<ErrorEventDetail>>,
    onReady: "ready" as EventName<CustomEvent<void>>,
  },
});

type CortiAmbientProps = Omit<
  React.ComponentProps<typeof CortiAmbientElement>,
  "ambientConfig"
> & {
  /** Let the handheld-mic Record button drive this surface (default true). */
  hidRecordingControl?: boolean;
  /**
   * Stream config for /streams. Accepts the app-level SDK v6 StreamConfig;
   * the underlying @corti/ambient-web component (which depends on SDK v3)
   * receives it as a plain object and sends it as JSON, so the structural
   * type mismatch between SDK versions is runtime-safe.
   */
  ambientConfig?: unknown;
};

/**
 * Wraps the ambient element so the handheld mic can drive recording — the same
 * `useHidRecordingControl` the dictation wrapper uses, active only while the
 * SpeechMike is the surface's selected mic.
 */
export const CortiAmbientComponent = React.forwardRef<
  InstanceType<typeof CortiAmbient>,
  CortiAmbientProps
>(function CortiAmbientComponent(props, forwardedRef) {
  const { hidRecordingControl = true, ...rest } = props;
  const innerRef = React.useRef<InstanceType<typeof CortiAmbient> | null>(null);
  const setRef = React.useCallback(
    (el: InstanceType<typeof CortiAmbient> | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === "function") {
        forwardedRef(el);
      } else if (forwardedRef) {
        forwardedRef.current = el;
      }
    },
    [forwardedRef],
  );
  useHidRecordingControl(innerRef, hidRecordingControl);

  // /streams has no session id of its own — the interaction id passed in here
  // is what support needs to find server logs, so publish it to the shared
  // footer the same way the dictation wrapper publishes its sessionId.
  const { setStatus, clear } = useSessionStatus();
  const interactionId = rest.interactionId;
  React.useEffect(() => {
    if (interactionId) {
      setStatus({ interactionId });
    }
    return () => clear();
  }, [interactionId, setStatus, clear]);

  return (
    <CortiAmbientElement
      ref={setRef}
      {...(rest as React.ComponentProps<typeof CortiAmbientElement>)}
    />
  );
});

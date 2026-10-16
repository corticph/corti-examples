/**
 * Audio archiving for the suite.
 *
 * WHY THIS IS A SECOND RECORDER: `<corti-dictation>` owns its microphone
 * internally and exposes no raw audio — its `audio-event` payload is a Corti
 * AudioEventMessage (server-side voice activity), not audio data, and the
 * element surfaces no MediaStream or MediaRecorder. Upstream, the audio-archive
 * applet only worked because it bypassed the web component entirely and drove
 * `client.transcribe.connect()` plus its own MediaRecorder — which would mean
 * giving up the component's handheld microphone device (HID) control, keybindings, device and
 * language pickers.
 *
 * So archiving runs as an INDEPENDENT capture of the same input device, gated on
 * the component's own `recording-state-changed` events. Consequences worth
 * knowing:
 *   - Two concurrent captures of one microphone (browsers allow this; it costs
 *     a little CPU and a second permission-free getUserMedia).
 *   - Segment boundaries are derived from the component's state events, so they
 *     track what was transcribed to within an event-dispatch tick rather than
 *     being sample-exact.
 *   - The archived audio is what the microphone heard, which is the point — but
 *     it is not byte-identical to the frames the component actually streamed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioArchive } from "../_shared/useAudioArchive";

const TIMESLICE_MS = 250;

interface AudioDeviceLike {
  label?: string;
  deviceId?: string;
}

/** The subset of `<corti-dictation>` this hook needs. */
export interface ArchiveSourceElement {
  selectedDevice?: AudioDeviceLike;
  addEventListener: HTMLElement["addEventListener"];
  removeEventListener: HTMLElement["removeEventListener"];
}

/**
 * `element` is passed by value rather than as a ref because the dictation
 * component is mounted only once auth resolves — a ref would still read `null`
 * on the render this hook first runs, and mutating `ref.current` later triggers
 * no re-render, so the `recording-state-changed` subscription would never be
 * installed.
 */
export function useParallelArchive(
  element: ArchiveSourceElement | null,
  namespace: string,
  enabled: boolean,
) {
  const archive = useAudioArchive(namespace);
  const {
    startArchive,
    startSegment,
    endSegment,
    appendChunk,
    finalizeActiveArchive,
    updateActiveArchiveMetadata,
  } = archive;

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturingRef = useRef(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const teardown = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => {
      t.stop();
    });
    streamRef.current = null;
    capturingRef.current = false;
  }, []);

  const stopCapture = useCallback(async () => {
    if (!capturingRef.current) {
      return;
    }
    teardown();
    await endSegment("stop");
    // MediaRecorder flushes a final `dataavailable` synchronously on stop(), so
    // by the time this microtask runs the last chunk is already appended.
    await finalizeActiveArchive("stop");
  }, [teardown, endSegment, finalizeActiveArchive]);

  const startCapture = useCallback(async () => {
    if (capturingRef.current) {
      return;
    }
    capturingRef.current = true;
    setCaptureError(null);
    try {
      const device = element?.selectedDevice;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: device?.deviceId ? { deviceId: { exact: device.deviceId } } : true,
      });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      await startArchive({
        connectionKey: `dictation:${Date.now()}`,
        endpoint: "dictation",
        deviceLabel: device?.label,
        configuredCaptureMime: "",
        actualCaptureMime: recorder.mimeType || null,
      });
      await updateActiveArchiveMetadata({
        actualCaptureMime: recorder.mimeType || null,
      });
      await startSegment("start");

      recorder.ondataavailable = (event) => {
        void appendChunk(event.data);
      };
      recorder.start(TIMESLICE_MS);
    } catch (e) {
      capturingRef.current = false;
      teardown();
      setCaptureError(e instanceof Error ? e.message : "Could not start archive capture.");
    }
  }, [element, startArchive, startSegment, appendChunk, updateActiveArchiveMetadata, teardown]);

  // Mirror the component's recording lifecycle.
  useEffect(() => {
    if (!element || !enabled) {
      return;
    }
    const onStateChanged = (event: Event) => {
      const state = (event as CustomEvent<{ state?: string }>).detail?.state;
      if (state === "recording") {
        void startCapture();
      } else if (state === "stopped") {
        void stopCapture();
      }
    };
    element.addEventListener("recording-state-changed", onStateChanged);
    return () => {
      element.removeEventListener("recording-state-changed", onStateChanged);
    };
  }, [element, enabled, startCapture, stopCapture]);

  // Turning archiving off mid-recording should finalize, not orphan, the take.
  useEffect(() => {
    if (!enabled && capturingRef.current) {
      void stopCapture();
    }
  }, [enabled, stopCapture]);

  // Never leave a live microphone track behind on unmount.
  useEffect(() => teardown, [teardown]);

  return { ...archive, captureError };
}

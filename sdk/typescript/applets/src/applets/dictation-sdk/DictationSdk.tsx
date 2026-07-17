/**
 * Applet — CONCEPT: raw-SDK host-managed microphone control.
 *
 * Uses @corti/sdk directly (no web component). The host owns the microphone via
 * MediaRecorder: connect → send config → wait for CONFIG_ACCEPTED → stream audio
 * frames with socket.sendAudio(). Shows the lower-level path for teams not using
 * the dictation web component. Transcript text is inserted with the shared
 * spacing/casing helper.
 */

import { CortiClient } from "@corti/sdk";
import { Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { spliceSegment } from "../_shared/text-insertion";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { cn } from "../_shared/utils";
import { buildDictationConfig } from "./config";

const LANGUAGE = "en";
const TIMESLICE_MS = 250;

type Phase = "idle" | "connecting" | "recording" | "stopping";

export function DictationSdk() {
  const { refreshAccessToken, sdkEnvironment } = useCortiAccessToken();
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string>();

  const socketRef = useRef<Awaited<ReturnType<CortiClient["transcribe"]["connect"]>> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | undefined>(undefined);

  const teardown = useCallback(() => {
    recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
    recorderRef.current = null;
    // biome-ignore lint/suspicious/useIterableCallbackReturn: forEach cleanup callbacks are intentionally void
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => teardown, [teardown]);

  const meter = (stream: MediaStream) => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) {
        peak = Math.max(peak, Math.abs(v - 128));
      }
      setLevel(Math.min(1, peak / 128));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const start = useCallback(async () => {
    setError(undefined);
    setPhase("connecting");
    try {
      const client = new CortiClient({
        environment: sdkEnvironment,
        auth: { refreshAccessToken },
      });
      // connect() with a configuration resolves only after CONFIG_ACCEPTED,
      // so audio is never sent before the handshake completes.
      const socket = await client.transcribe.connect({
        configuration: buildDictationConfig(LANGUAGE),
      });
      socketRef.current = socket;

      socket.on("message", (message) => {
        if (message.type === "transcript" && message.data.isFinal) {
          const seg = message.data.text;
          setText((prev) => {
            const { text: next } = spliceSegment(prev, prev.length, prev.length, seg, {
              primaryLanguage: LANGUAGE,
            });
            return next;
          });
        }
      });
      socket.on("error", (e) => setError(e?.message ?? "Socket error"));

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      meter(stream);

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && socketRef.current) {
          socketRef.current.sendAudio(await e.data.arrayBuffer());
        }
      };
      recorder.start(TIMESLICE_MS);
      setPhase("recording");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start");
      teardown();
      setPhase("idle");
    }
  }, [refreshAccessToken, sdkEnvironment, teardown]);

  const stop = useCallback(() => {
    setPhase("stopping");
    teardown();
    setPhase("idle");
  }, [teardown]);

  const recording = phase === "recording";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Raw SDK with host-managed mic</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No web component. The host captures audio with MediaRecorder and streams frames via the
          SDK socket, only after CONFIG_ACCEPTED.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder="Transcript will appear here…"
        className="w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground outline-none focus:border-corti-lime"
      />

      {error && <p className="text-sm text-variant-error-foreground">{error}</p>}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={recording ? stop : start}
          disabled={phase === "connecting" || phase === "stopping"}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
            recording
              ? "bg-variant-error text-variant-error-foreground"
              : "bg-corti-lime text-corti-lime-foreground",
          )}
        >
          {recording ? (
            <>
              <Square className="h-4 w-4" /> Stop
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" /> {phase === "connecting" ? "Connecting…" : "Record"}
            </>
          )}
        </button>

        <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-corti-lime transition-[width] duration-75"
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

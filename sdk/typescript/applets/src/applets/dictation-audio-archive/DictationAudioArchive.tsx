import { CortiClient } from "@corti/sdk";
import { Download, Mic, Square, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioArchiveEndReason, AudioArchiveListItem } from "../_shared/audioArchive";
import { identityNamespace } from "../_shared/configStore";
import { spliceSegment } from "../_shared/textInsertion";
import { useAudioArchive } from "../_shared/useAudioArchive";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { cn } from "../_shared/utils";
import { buildAudioArchiveConfig } from "./config";

const LANGUAGE = "en";
const TIMESLICE_MS = 250;
const SOCKET_WAIT_TIMEOUT_MS = 5000;

type Phase = "idle" | "connecting" | "recording" | "paused" | "ending";

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function downloadArchive(archive: AudioArchiveListItem) {
  const link = document.createElement("a");
  link.href = archive.playbackUrl;
  link.download = archive.fileName;
  link.click();
}

function displayCaptureMime(
  actualCaptureMime: string | null | undefined,
  configuredCaptureMime?: string,
) {
  if (actualCaptureMime) {
    return actualCaptureMime;
  }
  if (configuredCaptureMime && configuredCaptureMime !== "browser-default") {
    return configuredCaptureMime;
  }
  return "Resolves when recording starts";
}

export function DictationAudioArchive() {
  const { refreshAccessToken, sdkEnvironment, clientId, tenantName } = useCortiAccessToken();
  const namespace = identityNamespace(clientId, tenantName);
  const {
    archives,
    activeArchive,
    error: archiveError,
    startArchive,
    appendChunk,
    startSegment,
    endSegment,
    finalizeActiveArchive,
    discardActiveArchive,
    removeArchive,
    clearArchives,
  } = useAudioArchive(namespace);

  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string>();

  const phaseRef = useRef<Phase>("idle");
  const socketRef = useRef<Awaited<ReturnType<CortiClient["transcribe"]["connect"]>> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const pendingChunkPromiseRef = useRef<Promise<void> | null>(null);
  const pendingRecorderFlushResolverRef = useRef<(() => void) | null>(null);
  const pendingSocketFlushRef = useRef<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeoutId: number;
  } | null>(null);
  const pendingSocketEndRef = useRef<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeoutId: number;
  } | null>(null);

  const setPhaseState = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearPendingSocketWait = useCallback(
    (ref: typeof pendingSocketFlushRef | typeof pendingSocketEndRef, error?: Error) => {
      const pending = ref.current;
      if (!pending) {
        return;
      }
      window.clearTimeout(pending.timeoutId);
      ref.current = null;
      if (error) {
        pending.reject(error);
      } else {
        pending.resolve();
      }
    },
    [],
  );

  const stopAudioMeter = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
    setLevel(0);
  }, []);

  const releaseMedia = useCallback(async () => {
    recorderRef.current = null;
    // biome-ignore lint/suspicious/useIterableCallbackReturn: forEach cleanup callbacks are intentionally void
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    stopAudioMeter();
    if (audioCtxRef.current) {
      await audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, [stopAudioMeter]);

  const startMeter = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const buffer = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(buffer);
      let peak = 0;
      for (const value of buffer) {
        peak = Math.max(peak, Math.abs(value - 128));
      }
      setLevel(Math.min(1, peak / 128));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const waitForSocketSignal = useCallback(
    (kind: "flush" | "ended", ref: typeof pendingSocketFlushRef | typeof pendingSocketEndRef) => {
      return new Promise<void>((resolve, reject) => {
        clearPendingSocketWait(ref, new Error(`Replaced pending ${kind} waiter.`));
        ref.current = {
          resolve,
          reject,
          timeoutId: window.setTimeout(() => {
            ref.current = null;
            reject(new Error(`Timed out waiting for websocket ${kind}.`));
          }, SOCKET_WAIT_TIMEOUT_MS),
        };
      });
    },
    [clearPendingSocketWait],
  );

  const flushRecorderBuffer = useCallback(async () => {
    const recorder = recorderRef.current;
    if (recorder?.state !== "recording") {
      if (pendingChunkPromiseRef.current) {
        await pendingChunkPromiseRef.current;
      }
      return;
    }

    const recorderFlush = new Promise<void>((resolve) => {
      pendingRecorderFlushResolverRef.current = resolve;
      recorder.requestData();
    });

    await recorderFlush;
    if (pendingChunkPromiseRef.current) {
      await pendingChunkPromiseRef.current;
    }
  }, []);

  const sendSocketFlush = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }
    const waitForFlush = waitForSocketSignal("flush", pendingSocketFlushRef);
    socket.sendFlush({ type: "flush" });
    await waitForFlush;
  }, [waitForSocketSignal]);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || phaseRef.current !== "recording") {
      return;
    }

    setError(undefined);
    setPhaseState("ending");

    try {
      await endSegment("pause");
      const recorderFlush = new Promise<void>((resolve) => {
        pendingRecorderFlushResolverRef.current = resolve;
        recorder.requestData();
        recorder.pause();
      });

      stopAudioMeter();
      await recorderFlush;
      if (pendingChunkPromiseRef.current) {
        await pendingChunkPromiseRef.current;
      }
      await sendSocketFlush();
      setPhaseState("paused");
    } catch (pauseError) {
      setError(
        pauseError instanceof Error ? pauseError.message : "Failed to pause and flush recording.",
      );
      setPhaseState("paused");
    }
  }, [endSegment, sendSocketFlush, setPhaseState, stopAudioMeter]);

  const closeSession = useCallback(
    async (endReason: AudioArchiveEndReason) => {
      if (phaseRef.current === "idle") {
        return;
      }

      setError(undefined);
      setPhaseState("ending");
      const recorder = recorderRef.current;
      const socket = socketRef.current;

      try {
        if (recorder?.state === "recording") {
          await endSegment("stop");
          await flushRecorderBuffer();
        }

        if (recorder && recorder.state !== "inactive") {
          await new Promise<void>((resolve) => {
            recorder.addEventListener("stop", () => resolve(), { once: true });
            recorder.stop();
          });
        }

        if (socket) {
          try {
            const waitForEnd = waitForSocketSignal("ended", pendingSocketEndRef);
            socket.sendEnd({ type: "end" });
            await waitForEnd;
          } catch {
            // If the server does not acknowledge `end` in time, still close the
            // local socket and finalize the archive we already have.
          }
          socket.close();
        }
        socketRef.current = null;

        await releaseMedia();
        await finalizeActiveArchive(endReason);
      } catch (sessionError) {
        setError(
          sessionError instanceof Error ? sessionError.message : "Failed to close the session.",
        );
        await discardActiveArchive();
      } finally {
        clearPendingSocketWait(pendingSocketFlushRef);
        clearPendingSocketWait(pendingSocketEndRef);
        pendingRecorderFlushResolverRef.current = null;
        pendingChunkPromiseRef.current = null;
        setInterim("");
        setPhaseState("idle");
      }
    },
    [
      clearPendingSocketWait,
      discardActiveArchive,
      endSegment,
      finalizeActiveArchive,
      flushRecorderBuffer,
      releaseMedia,
      setPhaseState,
      waitForSocketSignal,
    ],
  );

  useEffect(() => {
    return () => {
      void closeSession("disconnect");
    };
  }, [closeSession]);

  const start = useCallback(async () => {
    if (phaseRef.current === "recording" || phaseRef.current === "connecting") {
      return;
    }

    setError(undefined);

    if (phaseRef.current === "paused") {
      const recorder = recorderRef.current;
      if (recorder?.state !== "paused") {
        setError("Session is paused but the recorder is not resumable.");
        return;
      }
      await startSegment("resume");
      recorder.resume();
      if (streamRef.current) {
        startMeter(streamRef.current);
      }
      setPhaseState("recording");
      return;
    }

    setPhaseState("connecting");

    try {
      const client = new CortiClient({
        environment: sdkEnvironment,
        auth: { refreshAccessToken },
      });
      const socket = await client.transcribe.connect({
        configuration: buildAudioArchiveConfig(LANGUAGE),
      });
      socketRef.current = socket;

      socket.on("message", (message) => {
        if (message.type === "flushed") {
          clearPendingSocketWait(pendingSocketFlushRef);
          return;
        }
        if (message.type === "ended") {
          clearPendingSocketWait(pendingSocketEndRef);
          return;
        }
        if (message.type !== "transcript") {
          return;
        }
        if (message.data.isFinal) {
          setInterim("");
          setText((previous) => {
            const { text: next } = spliceSegment(
              previous,
              previous.length,
              previous.length,
              message.data.text,
              { primaryLanguage: LANGUAGE },
            );
            return next;
          });
          return;
        }
        setInterim(message.data.text);
      });

      socket.on("error", (socketError) => {
        clearPendingSocketWait(
          pendingSocketFlushRef,
          new Error(socketError?.message ?? "Socket error"),
        );
        clearPendingSocketWait(
          pendingSocketEndRef,
          new Error(socketError?.message ?? "Socket error"),
        );
        setError(socketError?.message ?? "Socket error");
        void closeSession("error");
      });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startMeter(stream);

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      await startArchive({
        connectionKey: `transcribe:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        endpoint: "transcribe",
        interactionId: undefined,
        deviceLabel: stream.getAudioTracks()[0]?.label || undefined,
        configuredCaptureMime: recorder.mimeType || "browser-default",
        actualCaptureMime: recorder.mimeType || null,
      });
      await startSegment("start");

      recorder.ondataavailable = (event) => {
        const chunkWork = (async () => {
          if (event.data.size === 0) {
            return;
          }
          await appendChunk(event.data);
          if (socketRef.current) {
            socketRef.current.sendAudio(await event.data.arrayBuffer());
          }
        })()
          .catch((chunkError) => {
            setError(
              chunkError instanceof Error ? chunkError.message : "Failed to process audio chunk.",
            );
          })
          .finally(() => {
            if (pendingChunkPromiseRef.current === chunkWork) {
              pendingChunkPromiseRef.current = null;
            }
            if (pendingRecorderFlushResolverRef.current) {
              pendingRecorderFlushResolverRef.current();
              pendingRecorderFlushResolverRef.current = null;
            }
          });
        pendingChunkPromiseRef.current = chunkWork;
      };

      recorder.start(TIMESLICE_MS);
      setPhaseState("recording");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Failed to start.");
      socketRef.current?.close();
      socketRef.current = null;
      await releaseMedia();
      await discardActiveArchive();
      setPhaseState("idle");
    }
  }, [
    appendChunk,
    clearPendingSocketWait,
    closeSession,
    discardActiveArchive,
    refreshAccessToken,
    releaseMedia,
    sdkEnvironment,
    setPhaseState,
    startArchive,
    startMeter,
    startSegment,
  ]);

  const recording = phase === "recording";
  const paused = phase === "paused";
  const sessionOpen = phase !== "idle";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Dictation audio archive</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Raw SDK example: the host owns MediaRecorder, streams audio to Corti, and saves the same
          microphone blobs locally for playback and download. Stop recording pauses + flushes the
          current session; end session closes it.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="Transcript will appear here…"
          className="w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground outline-none focus:border-corti-lime"
        />

        <div className="min-h-6">
          {interim ? <p className="text-sm italic text-muted-foreground">{interim}</p> : null}
        </div>

        {error && <p className="text-sm text-variant-error-foreground">{error}</p>}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={recording ? () => void stopRecording() : () => void start()}
            disabled={phase === "connecting" || phase === "ending"}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
              recording
                ? "bg-variant-error text-variant-error-foreground"
                : "bg-corti-lime text-corti-lime-foreground",
            )}
          >
            {recording ? (
              <>
                <Square className="h-4 w-4" /> Stop + Flush
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />{" "}
                {phase === "connecting" ? "Connecting…" : paused ? "Resume recording" : "Record"}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void closeSession("ended")}
            disabled={!sessionOpen || phase === "connecting" || phase === "ending"}
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            <X className="h-4 w-4" /> End session
          </button>

          <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-corti-lime transition-[width] duration-75"
              style={{ width: `${Math.round(level * 100)}%` }}
            />
          </div>

          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {phase === "recording"
              ? "Recording"
              : phase === "paused"
                ? "Paused"
                : phase === "connecting"
                  ? "Connecting"
                  : phase === "ending"
                    ? "Ending"
                    : "Idle"}
          </span>
        </div>

        <section className="rounded-md border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Session audio</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Connection-scoped archive. Interaction ID is optional and not attached in this raw
                transcribe example. One websocket session can contain many pause/resume segments.
              </p>
            </div>
            {archives.length > 0 && (
              <button
                type="button"
                onClick={() => void clearArchives()}
                className="text-xs text-muted-foreground border hover:text-foreground"
              >
                Clear saved audio
              </button>
            )}
          </div>

          <div className="mt-4 rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
            <div className="font-medium text-foreground">
              {activeArchive ? "Archiving current connection" : "No active archive"}
            </div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div>Session state: {recording ? "recording" : paused ? "paused" : "idle"}</div>
              <div>
                Capture MIME:{" "}
                {displayCaptureMime(
                  activeArchive?.actualCaptureMime,
                  activeArchive?.configuredCaptureMime,
                )}
              </div>
              <div>Device: {activeArchive?.deviceLabel || "Uses browser-selected mic"}</div>
              <div>Segments recorded: {activeArchive?.segments.length || 0}</div>
              <div>Chunks recorded: {activeArchive?.chunkCount || 0}</div>
            </div>
          </div>

          {archiveError && (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {archiveError}
            </div>
          )}

          {archives.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              Saved microphone archives will appear here after a recording is stopped.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {archives.map((archive) => (
                <div key={archive.id} className="rounded-md border border-border/70 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-foreground">
                        {formatTimestamp(archive.createdAt)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDuration(archive.durationMs)} ·{" "}
                        {(archive.sizeBytes / 1024).toFixed(1)} KB · {archive.segmentCount} segment
                        {archive.segmentCount === 1 ? "" : "s"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {displayCaptureMime(
                          archive.actualCaptureMime,
                          archive.configuredCaptureMime,
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => downloadArchive(archive)}
                        className="rounded border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-accent"
                      >
                        <span className="flex items-center gap-1.5">
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeArchive(archive.id)}
                        className="rounded border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-accent"
                      >
                        <span className="flex items-center gap-1.5">
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* biome-ignore lint/a11y/useMediaCaption: diagnostic audio player — recordings are already transcribed */}
                  <audio
                    className="mt-3 w-full"
                    controls
                    preload="metadata"
                    src={archive.playbackUrl}
                  />

                  {archive.segments.length > 0 && (
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {archive.segments.map((segment, index) => (
                        <div key={segment.id}>
                          Segment {index + 1}: {formatDuration(segment.durationMs ?? 0)} ·{" "}
                          {segment.startReason}
                          {segment.endReason ? ` → ${segment.endReason}` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

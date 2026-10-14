import { CortiClient } from "@corti/sdk";
import { useCallback, useRef, useState } from "react";
import { EXAMPLES_ANALYTICS } from "../_shared/examplesAnalytics";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { buildComparisonConfigs } from "./config";
import type { FormattingCategory, FormattingOption } from "./formattingOptions";

const TIMESLICE_MS = 250;

type TranscribeSocket = Awaited<ReturnType<CortiClient["transcribe"]["connect"]>>;

export type ConnectionStatus = "idle" | "connecting" | "connected" | "paused" | "error" | "closed";

export interface ComparisonConnection {
  option: FormattingOption;
  status: ConnectionStatus;
  interim: string;
  final: string;
  error?: string;
}

interface InternalConnection {
  option: FormattingOption;
  socket: TranscribeSocket | null;
  status: ConnectionStatus;
  interim: string;
  final: string;
  error?: string;
}

export function useComparisonConnections(language: string) {
  const { refreshAccessToken, sdkEnvironment } = useCortiAccessToken();
  const [connections, setConnections] = useState<ComparisonConnection[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string>();

  const clientRef = useRef<CortiClient | null>(null);
  const socketsRef = useRef<InternalConnection[]>([]);
  const categoryKeyRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const updateRafRef = useRef<number | undefined>(undefined);
  const [level, setLevel] = useState(0);

  const updateState = useCallback(() => {
    setConnections(
      socketsRef.current.map((c) => ({
        option: c.option,
        status: c.status,
        interim: c.interim,
        final: c.final,
        error: c.error,
      })),
    );
  }, []);

  const scheduleUpdate = useCallback(() => {
    if (updateRafRef.current !== undefined) {
      return;
    }
    updateRafRef.current = requestAnimationFrame(() => {
      updateRafRef.current = undefined;
      updateState();
    });
  }, [updateState]);

  const meter = useCallback((stream: MediaStream) => {
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
  }, []);

  const stopMic = useCallback(() => {
    recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
    recorderRef.current = null;
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) {
        t.stop();
      }
    }
    streamRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  const teardown = useCallback(() => {
    stopMic();
    if (updateRafRef.current !== undefined) {
      cancelAnimationFrame(updateRafRef.current);
      updateRafRef.current = undefined;
    }
    for (const c of socketsRef.current) {
      try {
        c.socket?.sendEnd({ type: "end" });
      } catch {
        /* ignore */
      }
      try {
        c.socket?.close();
      } catch {
        /* ignore */
      }
    }
    socketsRef.current = [];
    categoryKeyRef.current = null;
    updateState();
  }, [stopMic, updateState]);

  const startRecorder = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    meter(stream);

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = async (e) => {
      if (e.data.size > 0) {
        const buffer = await e.data.arrayBuffer();
        for (const c of socketsRef.current) {
          if (c.socket && (c.status === "connected" || c.status === "paused")) {
            try {
              c.socket.sendAudio(buffer);
            } catch {
              /* socket may have closed */
            }
          }
        }
      }
    };
    recorder.start(TIMESLICE_MS);
    setIsRecording(true);
  }, [meter]);

  const connectSockets = useCallback(
    async (category: FormattingCategory) => {
      if (!sdkEnvironment.wss) {
        setError("No cluster configured — authenticate first.");
        return false;
      }

      const configs = buildComparisonConfigs(language, category);

      socketsRef.current = configs.map((c) => ({
        option: c.option,
        socket: null,
        status: "connecting",
        interim: "",
        final: "",
      }));
      categoryKeyRef.current = category.key;
      updateState();

      if (!clientRef.current) {
        clientRef.current = new CortiClient({
          environment: sdkEnvironment,
          auth: { refreshAccessToken },
          analytics: EXAMPLES_ANALYTICS,
        });
      }
      const client = clientRef.current;

      const connectResults = await Promise.allSettled(
        configs.map(async ({ option, config }) => {
          const socket = await client.transcribe.connect({
            configuration: config,
          });
          socket.on("message", (message) => {
            if (message.type === "transcript") {
              const entry = socketsRef.current.find((c) => c.option.value === option.value);
              if (!entry) {
                return;
              }
              if (message.data.isFinal) {
                entry.interim = "";
                entry.final = entry.final
                  ? `${entry.final} ${message.data.text}`
                  : message.data.text;
              } else {
                entry.interim = message.data.text;
              }
              scheduleUpdate();
            }
          });
          socket.on("error", (e: Error) => {
            const entry = socketsRef.current.find((c) => c.option.value === option.value);
            if (entry) {
              entry.status = "error";
              entry.error = e?.message ?? "Socket error";
              scheduleUpdate();
            }
          });
          socket.on("close", () => {
            const entry = socketsRef.current.find((c) => c.option.value === option.value);
            if (entry && entry.status !== "error") {
              entry.status = "closed";
              scheduleUpdate();
            }
          });

          const entry = socketsRef.current.find((c) => c.option.value === option.value);
          if (entry) {
            entry.socket = socket;
            entry.status = "connected";
          }
          scheduleUpdate();
          return socket;
        }),
      );

      const failedCount = connectResults.filter((r) => r.status === "rejected").length;
      if (failedCount === configs.length) {
        const firstRejection = connectResults.find(
          (r) => r.status === "rejected",
        ) as PromiseRejectedResult;
        setError(firstRejection.reason?.message ?? "All connections failed.");
        teardown();
        return false;
      }

      for (let i = 0; i < configs.length; i++) {
        const result = connectResults[i];
        if (result.status === "rejected") {
          const entry = socketsRef.current[i];
          if (entry) {
            entry.status = "error";
            entry.error = (result as PromiseRejectedResult).reason?.message ?? "Connection failed";
          }
        }
      }
      updateState();

      const connectedSockets = socketsRef.current.filter(
        (c) => c.status === "connected" && c.socket,
      );

      if (connectedSockets.length === 0) {
        setError("No connections established.");
        teardown();
        return false;
      }

      return true;
    },
    [language, refreshAccessToken, sdkEnvironment, teardown, updateState],
  );

  const start = useCallback(
    async (category: FormattingCategory) => {
      setError(undefined);

      const sameCategory =
        categoryKeyRef.current === category.key &&
        socketsRef.current.some((c) => c.socket && c.status !== "error");

      if (sameCategory) {
        for (const c of socketsRef.current) {
          if (c.status === "paused") {
            c.status = "connected";
          }
          c.interim = "";
        }
        updateState();
      } else {
        if (socketsRef.current.length > 0) {
          teardown();
        }
        const ok = await connectSockets(category);
        if (!ok) {
          return;
        }
      }

      try {
        await startRecorder();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start recording.");
        stopMic();
        for (const c of socketsRef.current) {
          if (c.status === "connected") {
            c.status = "paused";
          }
        }
        updateState();
      }
    },
    [connectSockets, startRecorder, stopMic, teardown, updateState],
  );

  const stop = useCallback(() => {
    setIsRecording(false);
    stopMic();

    for (const c of socketsRef.current) {
      if (c.status === "connected") {
        try {
          c.socket?.sendFlush({ type: "flush" });
        } catch {
          /* ignore */
        }
        c.status = "paused";
        c.interim = "";
      }
    }
    updateState();
  }, [stopMic, updateState]);

  const clear = useCallback(() => {
    setIsRecording(false);
    stopMic();
    teardown();
    setError(undefined);
  }, [stopMic, teardown]);

  return {
    connections,
    isRecording,
    error,
    level,
    start,
    stop,
    clear,
    teardown,
  };
}

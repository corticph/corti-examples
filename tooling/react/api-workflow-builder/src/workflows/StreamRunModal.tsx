import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/Button";
import { Label } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Pill } from "../components/ui/Pill";
import type { Profile } from "../profiles/types";
import { MicRecorder, pickMimeType } from "../streams/audio";
import {
  buildStreamsUrlFallback,
  type ClientStatus,
  type StreamConfig,
  type StreamEvent,
  StreamsClient,
} from "../streams/StreamsClient";

// Modal that hosts the entire live-recording experience when the first node of a
// workflow is `streams.connect`. Stages:
//
//   Setup     — pick mic input, click Start to open the WS + begin recording.
//   Recording — level meter, packet count, elapsed timer, Stop button.
//   Review    — see what got transcribed (and which facts were extracted), then
//               either pass the aggregate to the workflow run or discard + retry.
//
// On a successful run the modal calls onComplete with a structured aggregate object;
// that becomes the `body` of the streams node in the workflow context, so downstream
// REST nodes can do `{{stream_1.transcripts}}` / `{{stream_1.facts}}`.

export type StreamAggregate = {
  interactionId: string;
  status: "completed" | "incomplete" | "error";
  startedAt: string;
  endedAt: string;
  durationMs: number;
  transcripts: {
    id?: string;
    text: string;
    speakerId?: number;
    channel?: number;
    start?: number;
    end?: number;
  }[];
  facts: { id?: string; text: string; group?: string }[];
};

type Stage = "setup" | "recording" | "review" | "error";

export function StreamRunModal({
  open,
  interactionId,
  config,
  profile,
  ensureToken,
  onCancel,
  onComplete,
}: {
  open: boolean;
  interactionId: string;
  /** Parsed JSON config from the streams node's body. */
  config: StreamsNodeConfig;
  profile: Profile;
  ensureToken: (profileId: string) => Promise<string>;
  onCancel: () => void;
  onComplete: (aggregate: StreamAggregate) => void;
}) {
  const [stage, setStage] = useState<Stage>("setup");
  const [status, setStatus] = useState<ClientStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [level, setLevel] = useState(0);
  const [packetsSent, setPacketsSent] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [needsMicPermission, setNeedsMicPermission] = useState(false);

  const clientRef = useRef<StreamsClient | null>(null);
  const recorderRef = useRef<MicRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const endedAtRef = useRef<string | null>(null);

  // Enumerate mic devices when the modal opens. Same permission dance as the
  // standalone Streams page — browsers hide labels until mic permission is granted.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function refresh() {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const inputs = devs.filter((d) => d.kind === "audioinput");
        if (cancelled) return;
        setInputDevices(inputs);
        setNeedsMicPermission(inputs.length > 0 && inputs.every((d) => !d.label));
      } catch {
        if (!cancelled) setInputDevices([]);
      }
    }
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, [open]);

  // Reset transient state every time the modal opens — discard + retry should give a
  // fresh slate. Stable config and selected device stick (they live in props/state above).
  useEffect(() => {
    if (!open) return;
    setStage("setup");
    setStatus("idle");
    setError(null);
    setEvents([]);
    setLevel(0);
    setPacketsSent(0);
    setElapsed(0);
    startedAtRef.current = null;
    endedAtRef.current = null;
  }, [open]);

  // Cleanup if the modal closes mid-stream (e.g. user clicks the X). Tears down the
  // recorder and WS so we don't leak the mic or hold a dangling socket.
  useEffect(() => {
    if (open) return;
    teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function teardown() {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    try {
      clientRef.current?.close();
    } catch {
      /* ignore */
    }
    clientRef.current = null;
  }

  async function grantMicPermission() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      const devs = await navigator.mediaDevices.enumerateDevices();
      const inputs = devs.filter((d) => d.kind === "audioinput");
      setInputDevices(inputs);
      setNeedsMicPermission(false);
    } catch (e: any) {
      setError(`Couldn't get mic permission: ${e?.message ?? String(e)}`);
    }
  }

  async function start() {
    if (!interactionId) {
      setError("This stream node needs an interaction id (set it in the edit panel).");
      setStage("error");
      return;
    }
    setError(null);

    let token: string;
    try {
      token = await ensureToken(profile.id);
    } catch (e: any) {
      setError(`Couldn't mint token: ${e?.message ?? String(e)}`);
      setStage("error");
      return;
    }

    // The user picked an existing interaction in the edit panel, so we don't have a
    // server-issued websocketUrl. Build it from the documented shape.
    const url = buildStreamsUrlFallback({
      region: profile.region,
      interactionId,
      tenant: profile.tenant,
      accessToken: token,
    });

    const recorderMime = pickMimeType();
    const audioFormat = recorderMime ? recorderMime.replace(/;\s*/g, "; ").trim() : "";
    const streamConfig = buildStreamConfig(config, audioFormat);

    const client = new StreamsClient({
      onStatusChange: (s) => {
        setStatus(s);
        if (s === "closed") {
          // ENDED arrived (or socket dropped) — once we're past the recording stage
          // this means the server has flushed its final transcripts/facts and we can
          // safely move on to Review.
          if (recorderRef.current === null) {
            endedAtRef.current ||= new Date().toISOString();
            setStage((cur) => (cur === "recording" ? "review" : cur));
          }
        }
      },
      onEvent: (e) => setEvents((cur) => [...cur, e]),
      onError: (err) => {
        setError(err.message);
        setStage("error");
      },
    });
    clientRef.current = client;

    try {
      await client.connectAndConfig(url, streamConfig);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStage("error");
      return;
    }

    const recorder = new MicRecorder({
      onChunk: (chunk) => {
        client.sendAudio(chunk);
        setPacketsSent((n) => n + 1);
      },
      onError: (err) => {
        setError(err.message);
        setStage("error");
      },
      onLevel: (lv) => setLevel(lv),
    });
    recorderRef.current = recorder;
    try {
      await recorder.start({
        timesliceMs: 250,
        mimeType: recorderMime || undefined,
        deviceId: selectedDeviceId || undefined,
      });
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStage("error");
      try {
        client.close();
      } catch {
        /* ignore */
      }
      return;
    }

    startedAtRef.current = new Date().toISOString();
    setStage("recording");

    const t0 = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 250);
  }

  function stop() {
    // Stop the mic first so we're not still queuing chunks behind `end`. Then null the
    // recorder ref — the status callback uses that to detect "we're past recording"
    // and transition to review when ENDED arrives.
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    setLevel(0);
    try {
      clientRef.current?.end();
    } catch {
      /* ignore */
    }
    // If the server hangs for any reason, force-progress after 20s so the user isn't
    // stuck staring at a frozen "ending..." state.
    window.setTimeout(() => {
      if (clientRef.current && clientRef.current.currentStatus !== "closed") {
        try {
          clientRef.current.close();
        } catch {
          /* ignore */
        }
        endedAtRef.current ||= new Date().toISOString();
        setStage((cur) => (cur === "recording" ? "review" : cur));
      }
    }, 20000);
  }

  function runWithAggregate() {
    const { transcripts, facts } = extractContent(events);
    const startedAt = startedAtRef.current ?? new Date().toISOString();
    const endedAt = endedAtRef.current ?? new Date().toISOString();
    const aggregate: StreamAggregate = {
      interactionId,
      status: status === "closed" || status === "ending" ? "completed" : "incomplete",
      startedAt,
      endedAt,
      durationMs: new Date(endedAt).getTime() - new Date(startedAt).getTime(),
      transcripts,
      facts,
    };
    onComplete(aggregate);
  }

  return (
    <Modal open={open} onClose={onCancel} title="Live stream" widthClass="max-w-3xl">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Pill tone="accent">WSS</Pill>
          <span className="font-mono text-muted-700">
            {interactionId || "(no interaction picked)"}
          </span>
          <div className="grow" />
          <StatusPill status={status} stage={stage} />
        </div>

        {stage === "setup" && (
          <SetupStage
            inputDevices={inputDevices}
            selectedDeviceId={selectedDeviceId}
            needsMicPermission={needsMicPermission}
            onSelectDevice={setSelectedDeviceId}
            onGrantPermission={grantMicPermission}
            onStart={start}
            disabled={!interactionId}
          />
        )}

        {stage === "recording" && (
          <RecordingStage level={level} packetsSent={packetsSent} elapsed={elapsed} onStop={stop} />
        )}

        {stage === "review" && (
          <ReviewStage
            events={events}
            onRun={runWithAggregate}
            onDiscard={() => {
              teardown();
              setStage("setup");
              setEvents([]);
              setPacketsSent(0);
              setElapsed(0);
              startedAtRef.current = null;
              endedAtRef.current = null;
            }}
          />
        )}

        {stage === "error" && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <div className="font-medium">{error ?? "Stream error"}</div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  teardown();
                  setStage("setup");
                  setError(null);
                }}
                className="rounded-lg border border-red-300 bg-paper px-3 py-1.5 text-xs text-red-700 hover:bg-red-100"
              >
                Try again
              </button>
              <button
                onClick={onCancel}
                className="rounded-lg border border-muted-300 bg-paper px-3 py-1.5 text-xs text-ink hover:bg-paper-muted"
              >
                Cancel run
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---- Stages ----------------------------------------------------------------

function SetupStage({
  inputDevices,
  selectedDeviceId,
  needsMicPermission,
  onSelectDevice,
  onGrantPermission,
  onStart,
  disabled,
}: {
  inputDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  needsMicPermission: boolean;
  onSelectDevice: (id: string) => void;
  onGrantPermission: () => void;
  onStart: () => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-700">
        Pick an input device, then click Start. While recording you'll see the level meter and
        packet counter. Click Stop when you're done, then review what was transcribed before the
        workflow continues.
      </p>
      <div className="grid gap-1.5">
        <Label>Audio input</Label>
        {needsMicPermission ? (
          <button
            onClick={onGrantPermission}
            className="self-start rounded-md border border-muted-300 bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper-muted"
          >
            Grant mic permission to list devices
          </button>
        ) : (
          <select
            value={selectedDeviceId}
            onChange={(e) => onSelectDevice(e.target.value)}
            className="rounded-md border border-muted-300 bg-paper px-2 py-1.5 text-sm text-ink"
          >
            <option value="">System default</option>
            {inputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `(unnamed input ${d.deviceId.slice(0, 6)}…)`}
              </option>
            ))}
          </select>
        )}
        <p className="text-[11px] text-muted-500">
          Pick a virtual device (BlackHole on macOS, VB-Cable on Windows) to stream a file playing
          in QuickTime/VLC instead of the live mic.
        </p>
      </div>
      <div className="flex justify-end">
        <Button onClick={onStart} disabled={disabled || needsMicPermission}>
          ● Start recording
        </Button>
      </div>
    </div>
  );
}

function RecordingStage({
  level,
  packetsSent,
  elapsed,
  onStop,
}: {
  level: number;
  packetsSent: number;
  elapsed: number;
  onStop: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted-700">
        <span>● recording · {formatElapsed(elapsed)}</span>
        <span>packets sent {packetsSent}</span>
      </div>
      <LevelBar level={level} />
      <div className="flex justify-end">
        <button
          onClick={onStop}
          className="rounded-lg border border-muted-300 bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-paper-muted"
        >
          ■ Stop & review
        </button>
      </div>
    </div>
  );
}

function ReviewStage({
  events,
  onRun,
  onDiscard,
}: {
  events: StreamEvent[];
  onRun: () => void;
  onDiscard: () => void;
}) {
  const { transcripts, facts } = extractContent(events);
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-muted-300/60 bg-paper-muted p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-500">
            Transcripts ({transcripts.length})
          </div>
          <div className="max-h-60 overflow-y-auto text-xs">
            {transcripts.length === 0 ? (
              <p className="text-muted-500">No transcripts captured.</p>
            ) : (
              transcripts.map((t, i) => (
                <div key={i} className="mb-1.5 rounded bg-paper p-1.5">
                  {t.speakerId != null && t.speakerId >= 0 && (
                    <span className="mr-1 rounded bg-paper-muted px-1 py-0.5 font-mono text-[9px] text-muted-700">
                      spk {t.speakerId}
                    </span>
                  )}
                  {t.text}
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-lg border border-muted-300/60 bg-paper-muted p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-500">
            Facts ({facts.length})
          </div>
          <div className="max-h-60 overflow-y-auto text-xs">
            {facts.length === 0 ? (
              <p className="text-muted-500">
                No facts yet. (Empty if mode is 'transcription', or a short clip can leave the
                inference window unfilled.)
              </p>
            ) : (
              facts.map((f, i) => (
                <div key={i} className="mb-1.5 rounded bg-paper p-1.5">
                  {f.group && (
                    <span className="mr-1 rounded bg-accent-soft px-1 py-0.5 text-[9px] text-accent">
                      {f.group}
                    </span>
                  )}
                  {f.text}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onDiscard}
          className="rounded-lg border border-muted-300 bg-paper px-3 py-1.5 text-sm text-ink hover:bg-paper-muted"
        >
          Discard & retry
        </button>
        <Button onClick={onRun}>Run workflow with this output</Button>
      </div>
    </div>
  );
}

function StatusPill({ status, stage }: { status: ClientStatus; stage: Stage }) {
  const tone: "neutral" | "good" | "bad" | "accent" =
    status === "streaming"
      ? "good"
      : status === "error"
        ? "bad"
        : status === "idle"
          ? "neutral"
          : "accent";
  const label = stage === "review" ? "ready" : status;
  return <Pill tone={tone}>{label}</Pill>;
}

function LevelBar({ level }: { level: number }) {
  const pct = Math.round(level * 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-paper-muted">
      <div
        className="h-full bg-emerald-500 transition-[width] duration-75"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function formatElapsed(s: number): string {
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

// ---- Aggregation ----------------------------------------------------------
// Mirrors the standalone Streams page's extractor — see /api-reference/streams for the
// shapes. Transcripts come under `data: [{ transcript, speakerId, participant, time, ... }]`;
// facts come under `fact: [{ text, group, ... }]` (singular key — yes, really).

function extractContent(events: StreamEvent[]): {
  transcripts: StreamAggregate["transcripts"];
  facts: StreamAggregate["facts"];
} {
  const transcripts: StreamAggregate["transcripts"] = [];
  const facts: StreamAggregate["facts"] = [];
  for (const e of events) {
    const t = String(e.type ?? "").toLowerCase();
    if (t === "transcript" || t === "transcripts") {
      const segs: any[] = Array.isArray((e as any).data) ? (e as any).data : [];
      for (const seg of segs) {
        const text = typeof seg?.transcript === "string" ? seg.transcript : seg?.text;
        if (typeof text !== "string") continue;
        transcripts.push({
          id: seg?.id,
          text,
          speakerId: typeof seg?.speakerId === "number" ? seg.speakerId : undefined,
          channel:
            typeof seg?.participant?.channel === "number" ? seg.participant.channel : undefined,
          start: seg?.time?.start,
          end: seg?.time?.end,
        });
      }
    } else if (t === "facts" || t === "fact") {
      const items: any[] = Array.isArray((e as any).fact)
        ? (e as any).fact
        : Array.isArray((e as any).facts)
          ? (e as any).facts
          : Array.isArray((e as any).data)
            ? (e as any).data
            : [];
      for (const f of items) {
        if (typeof f?.text === "string") {
          facts.push({
            id: f?.id,
            text: f.text,
            group: typeof f?.group === "string" ? f.group : undefined,
          });
        }
      }
    }
  }
  return { transcripts, facts };
}

// ---- Config translation ---------------------------------------------------
// The node's body schema is shaped for nice UX in EndpointForm; the wire shape Corti
// expects is slightly different. This adapter handles the conversion in one place.

export type StreamsNodeConfig = {
  primaryLanguage?: string;
  mode?: "facts" | "transcription";
  outputLocale?: string;
  factGenerationInterval?: "" | "fixed" | "fast_init";
  isDiarization?: boolean;
  retentionPolicy?: "retain" | "none";
  audioEvents?: boolean;
};

function buildStreamConfig(c: StreamsNodeConfig, audioFormat: string): StreamConfig {
  const mode = c.mode ?? "transcription";
  return {
    type: "config",
    configuration: {
      transcription: {
        primaryLanguage: c.primaryLanguage ?? "en",
        isDiarization: c.isDiarization || undefined,
        // Mono default — every reference example in the docs uses this for a single
        // mic source. Workflows don't (yet) expose participants config; if you need
        // multichannel, edit the body JSON directly.
        participants: [{ channel: 0, role: "multiple" }],
      },
      mode: {
        type: mode,
        ...(mode === "facts" && c.outputLocale ? { outputLocale: c.outputLocale } : {}),
        ...(mode === "facts" && c.factGenerationInterval
          ? { factGenerationInterval: c.factGenerationInterval }
          : {}),
      },
      ...(c.retentionPolicy && c.retentionPolicy !== "retain"
        ? { retentionPolicy: c.retentionPolicy }
        : {}),
      ...(audioFormat ? { audioFormat } : {}),
      ...(c.audioEvents ? { audioEvents: { enabled: true } } : {}),
    },
  };
}

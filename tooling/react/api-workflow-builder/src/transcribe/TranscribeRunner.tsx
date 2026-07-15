import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Label, Select } from "../components/ui/Input";
import { Pill } from "../components/ui/Pill";
import { useProfiles } from "../context/ProfilesContext";
import { LANGUAGE_CODES, LANGUAGE_LABELS } from "../endpoints/languages";
import { FILE_AUDIO_FORMAT, FileRecorder, MicRecorder, pickMimeType } from "../streams/audio";
import {
  buildTranscribeUrl,
  type ClientStatus,
  type StreamConfig,
  type StreamEvent,
  StreamsClient,
} from "../streams/StreamsClient";

// Slim runner for the stateless /transcribe WSS endpoint. Mirrors the StreamsRunner UX
// but trims everything tied to /streams' interaction binding: no interaction picker, no
// websocketUrl capture, no facts panel, no retention policy. Same audio plumbing
// (MicRecorder + FileRecorder + StreamsClient) — the wire protocol for /transcribe is
// identical: send a config message, wait for CONFIG_ACCEPTED, push binary audio, get
// transcript events, send {type:"end"} to flush.

type AudioSource = "mic" | "file";

type Configuration = {
  primaryLanguage: string;
  interimResults: boolean;
  // Per docs these two are mutually exclusive — if both true, spokenPunctuation wins.
  spokenPunctuation: boolean;
  automaticPunctuation: boolean;
  audioEvents: boolean;
};

const DEFAULT_CONFIG: Configuration = {
  primaryLanguage: "en",
  interimResults: true,
  spokenPunctuation: false,
  automaticPunctuation: true,
  audioEvents: false,
};

type OutputTab = "transcripts" | "commands" | "raw";

export function TranscribeRunner() {
  const { active, ensureToken } = useProfiles();

  const [config, setConfig] = useState<Configuration>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<ClientStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [packetsSent, setPacketsSent] = useState(0);

  const clientRef = useRef<StreamsClient | null>(null);
  const recorderRef = useRef<MicRecorder | FileRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  // Audio source state — mirror of StreamsRunner's setup but inlined here since
  // sharing the SourcePicker component would mean refactoring it out into shared code.
  const [audioSource, setAudioSource] = useState<AudioSource>("mic");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioFileMeta, setAudioFileMeta] = useState<{
    name: string;
    durationSec: number | null;
    bytes: number;
  } | null>(null);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [needsMicPermission, setNeedsMicPermission] = useState(false);

  // Refresh the device list whenever the mic source is selected. Browsers hide labels
  // until mic permission has been granted at least once — surface a grant button when
  // we see only blank labels.
  useEffect(() => {
    if (audioSource !== "mic") return;
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
  }, [audioSource]);

  // Unmount cleanup so we don't leak the mic / WS if the user navigates away mid-stream.
  useEffect(() => {
    return () => {
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function grantMicPermission() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      const devs = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(devs.filter((d) => d.kind === "audioinput"));
      setNeedsMicPermission(false);
    } catch (e: any) {
      setError(`Couldn't get mic permission: ${e?.message ?? String(e)}`);
    }
  }

  async function start() {
    setError(null);
    setEvents([]);
    setPacketsSent(0);
    setElapsed(0);

    if (!active) {
      setError("No active profile. Set one up in Profiles first.");
      return;
    }

    let token: string;
    try {
      token = await ensureToken(active.id);
    } catch (e: any) {
      setError(`Couldn't mint token: ${e?.message ?? String(e)}`);
      return;
    }

    const url = buildTranscribeUrl({
      region: active.region,
      tenant: active.tenant,
      accessToken: token,
    });

    // Pick the audio format up front. For mic, the recorder negotiates webm/opus and
    // we declare exactly that. For file, FileRecorder always emits raw 16kHz mono PCM.
    const recorderMime = audioSource === "mic" ? pickMimeType() : "";
    const audioFormat =
      audioSource === "file"
        ? FILE_AUDIO_FORMAT
        : recorderMime
          ? recorderMime.replace(/;\s*/g, "; ").trim()
          : "";

    // Build the /transcribe config message. Note: primaryLanguage is the only required
    // field. The others default sensibly per docs. spokenPunctuation overrides
    // automaticPunctuation when both are set — we send only the one the user picked.
    const streamConfig: StreamConfig = {
      type: "config",
      configuration: {
        // The shared StreamConfig type was modelled around /streams; transcribe has
        // different inner shapes (no transcription/mode wrappers, flat fields). We
        // cast through `as any` here because the public type lives in StreamsClient.
        ...({
          primaryLanguage: config.primaryLanguage,
          ...(config.interimResults ? { interimResults: true } : {}),
          ...(config.spokenPunctuation
            ? { spokenPunctuation: true }
            : config.automaticPunctuation
              ? { automaticPunctuation: true }
              : {}),
          ...(audioFormat ? { audioFormat } : {}),
          ...(config.audioEvents ? { audioEvents: { enabled: true } } : {}),
        } as any),
      } as any,
    };

    const client = new StreamsClient({
      onStatusChange: (s) => {
        setStatus(s);
        if (s === "closed") {
          // Server sent ENDED (or socket dropped). Release our side and drop the ref
          // so a subsequent Start gets a fresh client.
          try {
            clientRef.current?.close();
          } catch {
            /* ignore */
          }
          clientRef.current = null;
        }
      },
      onEvent: (e) => setEvents((cur) => [...cur, { _ts: Date.now(), ...e } as any]),
      onError: (err) => setError(err.message),
    });
    clientRef.current = client;

    try {
      await client.connectAndConfig(url, streamConfig);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      return;
    }

    // CONFIG_ACCEPTED received — safe to send audio.
    const onChunk = (chunk: Blob | ArrayBuffer) => {
      client.sendAudio(chunk);
      setPacketsSent((n) => n + 1);
    };
    const onSourceError = (err: Error) => setError(err.message);
    const onLevel = (lv: number) => setLevel(lv);

    try {
      if (audioSource === "file") {
        if (!audioFile) {
          setError("Pick an audio file before starting.");
          client.close();
          return;
        }
        const fr = new FileRecorder({
          onChunk,
          onError: onSourceError,
          onLevel,
          onEnded: () => stopEverything(),
        });
        recorderRef.current = fr;
        await fr.start({ file: audioFile });
      } else {
        const mic = new MicRecorder({ onChunk, onError: onSourceError, onLevel });
        recorderRef.current = mic;
        await mic.start({
          timesliceMs: 250,
          mimeType: recorderMime || undefined,
          deviceId: selectedDeviceId || undefined,
        });
      }
    } catch (e: any) {
      setError(e.message ?? String(e));
      client.close();
      return;
    }

    const startedAt = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
  }

  function stopEverything() {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current?.stop();
    recorderRef.current = null;
    // Tell the server we're done and let it flush — the onStatusChange handler closes
    // our side once status reaches "closed". Safety timeout for hung servers.
    try {
      clientRef.current?.end();
    } catch {
      /* ignore */
    }
    const stalled = clientRef.current;
    if (stalled) {
      window.setTimeout(() => {
        if (clientRef.current === stalled && stalled.currentStatus !== "closed") {
          try {
            stalled.close();
          } catch {
            /* ignore */
          }
          clientRef.current = null;
          setStatus("closed");
        }
      }, 20000);
    }
    setLevel(0);
  }

  const isLive = status === "streaming" || status === "configuring" || status === "open";
  const canStart = !isLive && !!active && (audioSource === "mic" || !!audioFile);

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Live transcribe</h1>
        <p className="mt-1 text-sm text-muted-700">
          Stateless real-time dictation via{" "}
          <code className="font-mono">/audio-bridge/v2/transcribe</code>. No interaction binding —
          use Streams for ambient-conversation workflows tied to an interaction.
        </p>
      </header>

      {/* --- CONFIGURATION --- */}
      <section className="rounded-xl border border-muted-300/40 bg-paper p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-ink">Configuration</h2>
        <div className="grid gap-4">
          <Row label="primaryLanguage" required help="Spoken language of the audio (BCP 47).">
            <Select
              value={config.primaryLanguage}
              onChange={(e) => setConfig({ ...config, primaryLanguage: e.target.value })}
            >
              {LANGUAGE_CODES.map((c) => (
                <option key={c} value={c}>
                  {LANGUAGE_LABELS[c] ?? c}
                </option>
              ))}
            </Select>
          </Row>
          <Row
            label="interimResults"
            kind="bool"
            help="Faster preview transcripts with isFinal=false."
          >
            <CheckBox
              checked={config.interimResults}
              onChange={(v) => setConfig({ ...config, interimResults: v })}
            />
          </Row>
          <Row
            label="spokenPunctuation"
            kind="bool"
            help='Convert spoken "period"/"slash" to . / characters. Overrides automaticPunctuation.'
          >
            <CheckBox
              checked={config.spokenPunctuation}
              onChange={(v) => setConfig({ ...config, spokenPunctuation: v })}
            />
          </Row>
          <Row
            label="automaticPunctuation"
            kind="bool"
            help="Auto-punctuate + capitalize the final transcript."
          >
            <CheckBox
              checked={config.automaticPunctuation}
              onChange={(v) => setConfig({ ...config, automaticPunctuation: v })}
            />
          </Row>
          <Row
            label="audioEvents"
            kind="bool"
            help="Emit audio quality / speech activity events on the WS."
          >
            <CheckBox
              checked={config.audioEvents}
              onChange={(v) => setConfig({ ...config, audioEvents: v })}
            />
          </Row>
        </div>
      </section>

      {/* --- STREAM CONTROLS --- */}
      <section className="rounded-xl border border-muted-300/40 bg-paper p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-ink">Stream</h2>
        <div className="grid gap-3">
          <div className="grid gap-2 rounded-lg border border-muted-300/40 bg-paper-muted p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-500">
                Source
              </span>
              <SegTab
                active={audioSource === "mic"}
                onClick={() => setAudioSource("mic")}
                disabled={isLive}
              >
                Microphone
              </SegTab>
              <SegTab
                active={audioSource === "file"}
                onClick={() => setAudioSource("file")}
                disabled={isLive}
              >
                Audio file
              </SegTab>
              {audioSource === "mic" && (
                <>
                  {needsMicPermission ? (
                    <button
                      onClick={grantMicPermission}
                      disabled={isLive}
                      className="rounded-md border border-muted-300 bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-paper-muted disabled:opacity-50"
                    >
                      Grant mic permission
                    </button>
                  ) : (
                    <select
                      value={selectedDeviceId}
                      disabled={isLive}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                      className="rounded-md border border-muted-300 bg-paper px-2 py-1 text-xs text-ink disabled:opacity-50"
                    >
                      <option value="">System default</option>
                      {inputDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `(unnamed ${d.deviceId.slice(0, 6)}…)`}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
              {audioSource === "file" && (
                <>
                  <input
                    type="file"
                    accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.webm"
                    disabled={isLive}
                    onChange={async (e) => {
                      const f = e.target.files?.[0] ?? null;
                      setAudioFile(f);
                      setAudioFileMeta(
                        f ? { name: f.name, bytes: f.size, durationSec: null } : null,
                      );
                      if (f) {
                        try {
                          const url = URL.createObjectURL(f);
                          const a = new Audio();
                          a.preload = "metadata";
                          a.src = url;
                          await new Promise<void>((resolve, reject) => {
                            a.onloadedmetadata = () => resolve();
                            a.onerror = () => reject(new Error("metadata"));
                          });
                          setAudioFileMeta({
                            name: f.name,
                            bytes: f.size,
                            durationSec: isFinite(a.duration) ? a.duration : null,
                          });
                          URL.revokeObjectURL(url);
                        } catch {
                          /* leave duration null */
                        }
                      }
                    }}
                    className="block text-xs text-muted-700 file:mr-2 file:rounded-md file:border file:border-muted-300 file:bg-paper file:px-3 file:py-1 file:text-xs file:font-medium file:text-ink hover:file:bg-paper-muted"
                  />
                  {audioFile && (
                    <span className="font-mono text-[11px] text-muted-700">
                      {audioFileMeta?.durationSec != null
                        ? `${audioFileMeta.durationSec.toFixed(1)}s · `
                        : ""}
                      {((audioFileMeta?.bytes ?? audioFile.size) / 1024).toFixed(0)} KB
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={start} disabled={!canStart}>
              {audioSource === "file" ? "▶ Play & transcribe" : "● Start recording"}
            </Button>
            <button
              onClick={stopEverything}
              disabled={!isLive}
              className="rounded-lg border border-muted-300 bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-paper-muted disabled:opacity-50"
            >
              ■ End stream
            </button>
            <StatusPill status={status} />
            <div className="grow" />
            <div className="font-mono text-xs text-muted-700">
              {formatElapsed(elapsed)} · packets sent {packetsSent} · events {events.length}
            </div>
          </div>
          <LevelBar level={level} active={status === "streaming"} />
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-900">
              {error}
            </div>
          )}
          {!active && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-900">
              No active profile. Set one up in{" "}
              <Link to="/profiles" className="underline">
                Profiles
              </Link>
              .
            </div>
          )}
        </div>
      </section>

      {/* --- OUTPUT --- */}
      <section className="rounded-xl border border-muted-300/40 bg-paper p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-ink">Output</h2>
        <OutputPanel events={events} />
      </section>
    </div>
  );
}

// ---- subcomponents (slimmed copies of StreamsRunner's pieces) ----

function Row({
  label,
  kind,
  required,
  help,
  children,
}: {
  label: string;
  kind?: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label>{label}</Label>
        {kind && <Pill tone="neutral">{kind}</Pill>}
        {required && (
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
            Required
          </span>
        )}
      </div>
      {children}
      {help && <p className="text-xs text-muted-500">{help}</p>}
    </div>
  );
}

function CheckBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-muted-300"
      />
      <span className="text-muted-700">{checked ? "true" : "false"}</span>
    </label>
  );
}

function SegTab({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "bg-ink text-paper"
          : "border border-muted-300 bg-paper text-ink hover:bg-paper-muted"
      }`}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: ClientStatus }) {
  const tone: Record<ClientStatus, "neutral" | "good" | "bad" | "accent"> = {
    idle: "neutral",
    connecting: "accent",
    open: "accent",
    configuring: "accent",
    streaming: "good",
    ending: "neutral",
    closed: "neutral",
    error: "bad",
  };
  return <Pill tone={tone[status]}>{status}</Pill>;
}

function LevelBar({ level, active }: { level: number; active: boolean }) {
  const pct = Math.round(level * 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-paper-muted">
      <div
        className={`h-full transition-[width] duration-75 ${active ? "bg-emerald-500" : "bg-muted-300"}`}
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

// ---- output panel ----

function OutputPanel({ events }: { events: StreamEvent[] }) {
  const [tab, setTab] = useState<OutputTab>("transcripts");
  const { transcripts, commands } = useMemo(() => extractContent(events), [events]);
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-1 border-b border-muted-300/60 text-sm">
        <Tab active={tab === "transcripts"} onClick={() => setTab("transcripts")}>
          Transcripts <span className="text-muted-500">({transcripts.length})</span>
        </Tab>
        <Tab active={tab === "commands"} onClick={() => setTab("commands")}>
          Commands <span className="text-muted-500">({commands.length})</span>
        </Tab>
        <Tab active={tab === "raw"} onClick={() => setTab("raw")}>
          Raw events <span className="text-muted-500">({events.length})</span>
        </Tab>
      </div>

      {tab === "transcripts" && (
        <div className="grid gap-1">
          {transcripts.length === 0 && (
            <EmptyState>
              Transcripts will appear here. With interimResults on, you'll see {`<i>previews</i>`}{" "}
              first, then final results — same row updates when finalised.
            </EmptyState>
          )}
          {transcripts.map((t, i) => (
            <div
              key={i}
              className={`rounded border border-muted-300/40 p-2 text-sm ${
                t.isFinal ? "bg-paper-muted text-ink" : "bg-paper italic text-muted-700"
              }`}
            >
              {!t.isFinal && (
                <span className="mr-2 rounded bg-paper-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-500">
                  interim
                </span>
              )}
              {t.text}
            </div>
          ))}
        </div>
      )}

      {tab === "commands" && (
        <div className="grid gap-1">
          {commands.length === 0 && <EmptyState>No commands recognised yet.</EmptyState>}
          {commands.map((c, i) => (
            <div key={i} className="rounded border border-muted-300/40 bg-paper-muted p-2 text-sm">
              <span className="mr-2 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                {c.id}
              </span>
              {c.phrase && <span>{c.phrase}</span>}
              {c.variables && Object.keys(c.variables).length > 0 && (
                <span className="ml-2 font-mono text-[10px] text-muted-500">
                  {JSON.stringify(c.variables)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "raw" && (
        <div className="grid gap-1">
          {events.length === 0 && <EmptyState>No events yet.</EmptyState>}
          {events.map((e, i) => (
            <pre
              key={i}
              className="overflow-auto rounded border border-muted-300/40 bg-ink p-2 text-[11px] leading-tight text-paper"
            >
              {JSON.stringify(stripTs(e), null, 2)}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
        active ? "border-ink text-ink" : "border-transparent text-muted-500 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-muted-300 bg-paper-muted p-4 text-center text-xs text-muted-500">
      {children}
    </div>
  );
}

function stripTs(e: StreamEvent): StreamEvent {
  const { _ts, ...rest } = e as any;
  return rest;
}

// /transcribe emits transcript events with `isFinal` and command_detected events with
// id + matched phrase + extracted variables. We flatten both for the tabs.
function extractContent(events: StreamEvent[]): {
  transcripts: { text: string; isFinal: boolean }[];
  commands: { id: string; phrase?: string; variables?: Record<string, unknown> }[];
} {
  const transcripts: { text: string; isFinal: boolean }[] = [];
  const commands: { id: string; phrase?: string; variables?: Record<string, unknown> }[] = [];
  for (const e of events) {
    const t = String(e.type ?? "").toLowerCase();
    if (t === "transcript") {
      const data: any = (e as any).data ?? e;
      const segs = Array.isArray(data)
        ? data
        : Array.isArray(data?.transcript)
          ? data.transcript
          : [data];
      for (const seg of segs) {
        const text = typeof seg?.transcript === "string" ? seg.transcript : seg?.text;
        if (typeof text !== "string") continue;
        transcripts.push({ text, isFinal: seg?.isFinal !== false });
      }
    } else if (t === "command_detected" || t === "command") {
      const d: any = (e as any).data ?? e;
      const id = d?.id ?? d?.commandId;
      if (typeof id === "string") {
        commands.push({
          id,
          phrase: typeof d?.phrase === "string" ? d.phrase : undefined,
          variables: d?.variables && typeof d.variables === "object" ? d.variables : undefined,
        });
      }
    }
  }
  return { transcripts, commands };
}

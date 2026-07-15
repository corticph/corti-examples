import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ParamPicker } from "../components/ParamPicker";
import { Button } from "../components/ui/Button";
import { Label, Select } from "../components/ui/Input";
import { Pill } from "../components/ui/Pill";
import { useProfiles } from "../context/ProfilesContext";
import { interactionPicker } from "../endpoints/interactions";
import { LANGUAGE_CODES, LANGUAGE_LABELS } from "../endpoints/languages";
import { endpointById } from "../endpoints/registry";
import type { FormValues } from "../endpoints/types";
import { emptyValuesFor } from "../endpoints/types";
import { executeRequest } from "../lib/requestExecutor";
import { FILE_AUDIO_FORMAT, FileRecorder, MicRecorder, pickMimeType } from "./audio";

type AudioSource = "mic" | "file";

import {
  appendStreamsToken,
  buildStreamsUrlFallback,
  type ClientStatus,
  type StreamConfig,
  type StreamEvent,
  StreamsClient,
} from "./StreamsClient";

type ModeChoice = "transcription" | "facts";

type Configuration = {
  primaryLanguage: string;
  isDiarization: boolean;
  mode: ModeChoice;
  outputLocale: string;
  factGenerationInterval: "" | "fixed" | "fast_init";
  retentionPolicy: "retain" | "none";
  audioEventsEnabled: boolean;
};

const DEFAULT_CONFIG: Configuration = {
  primaryLanguage: "en",
  isDiarization: false,
  mode: "facts", // most useful default — facts mode also returns transcripts
  outputLocale: "en",
  factGenerationInterval: "",
  retentionPolicy: "retain",
  audioEventsEnabled: false,
};

type OutputTab = "transcripts" | "facts" | "raw";

export function StreamsRunner() {
  const { active, ensureToken } = useProfiles();

  // --- interaction wiring ---
  const [interactionId, setInteractionId] = useState<string>("");
  // The docs explicitly say to connect using the websocketUrl returned by POST /interactions
  // rather than constructing it. We capture it after Create new; for an interaction picked
  // from the existing list we fall back to manual construction (we never saw the create response).
  const [websocketUrl, setWebsocketUrl] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // --- config ---
  const [config, setConfig] = useState<Configuration>(DEFAULT_CONFIG);

  // --- runtime ---
  const [status, setStatus] = useState<ClientStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [elapsed, setElapsed] = useState(0); // seconds since recording started
  const [level, setLevel] = useState(0);
  const [packetsSent, setPacketsSent] = useState(0);
  const clientRef = useRef<StreamsClient | null>(null);
  const recorderRef = useRef<MicRecorder | FileRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  // --- audio source ---
  const [audioSource, setAudioSource] = useState<AudioSource>("mic");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioFileMeta, setAudioFileMeta] = useState<{
    name: string;
    durationSec: number | null;
    bytes: number;
  } | null>(null);
  // Browser-level input device picker. Lets the user select BlackHole / VB-Cable / aggregate
  // devices without changing the OS default input. Empty string = system default.
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [needsMicPermission, setNeedsMicPermission] = useState(false);

  // Enumerate input devices when the mic source is active. Browsers hide device labels
  // until the page has been granted mic permission at least once, so we surface a
  // "Grant permission" CTA when labels come back empty.
  useEffect(() => {
    if (audioSource !== "mic") return;
    let cancelled = false;
    async function refresh() {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const inputs = devs.filter((d) => d.kind === "audioinput");
        if (cancelled) return;
        setAudioInputDevices(inputs);
        setNeedsMicPermission(inputs.length > 0 && inputs.every((d) => !d.label));
      } catch {
        if (!cancelled) setAudioInputDevices([]);
      }
    }
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, [audioSource]);

  async function grantMicPermission() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      const devs = await navigator.mediaDevices.enumerateDevices();
      const inputs = devs.filter((d) => d.kind === "audioinput");
      setAudioInputDevices(inputs);
      setNeedsMicPermission(false);
    } catch (e: any) {
      setError(`Couldn't get mic permission: ${e?.message ?? String(e)}`);
    }
  }

  // Reset on unmount.
  useEffect(() => {
    return () => {
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synthetic FormValues for the interaction picker (it only needs to read/write `path.id`).
  const pickerValues: FormValues = useMemo(
    () => ({ path: { id: interactionId }, query: {}, headers: {}, body: "" }),
    [interactionId],
  );

  async function createInteraction() {
    setCreateError(null);
    if (!active) {
      setCreateError("No active profile. Set one up in Profiles first.");
      return;
    }
    const ep = endpointById["interactions.create"];
    if (!ep) {
      setCreateError("Couldn't find interactions.create endpoint.");
      return;
    }
    setCreating(true);
    try {
      const token = await ensureToken(active.id);
      // Minimal body — encounter.identifier is required, and we pass a timestamp + status
      // to keep the new interaction usable in the Console afterwards.
      const body = {
        encounter: {
          identifier: `streams-test-${Date.now()}`,
          status: "in-progress",
          type: "consultation",
          period: { startedAt: new Date().toISOString() },
          title: "Streams playground session",
        },
      };
      const values: FormValues = {
        path: {},
        query: {},
        headers: {},
        body: JSON.stringify(body),
      };
      const res = await executeRequest({ endpoint: ep, values, profile: active, token });
      if (res.status >= 400) {
        setCreateError(`Create failed: ${res.status} ${res.statusText}`);
        return;
      }
      const id = (res.body as any)?.interactionId ?? (res.body as any)?.id ?? "";
      if (!id) {
        setCreateError("Create returned 2xx but no interaction id in body.");
        return;
      }
      setInteractionId(String(id));
      // Capture the server-issued websocketUrl. This is the canonical way to connect
      // to /streams per the docs; we'll prefer it over manual construction.
      const wsUrl = (res.body as any)?.websocketUrl;
      if (typeof wsUrl === "string" && wsUrl) {
        setWebsocketUrl(wsUrl);
      } else {
        setWebsocketUrl("");
      }
    } catch (e: any) {
      setCreateError(e?.message ?? String(e));
    } finally {
      setCreating(false);
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
    if (!interactionId) {
      setError("Pick an interaction (or create a new one) before starting.");
      return;
    }
    if (config.mode === "facts" && !config.outputLocale) {
      setError('outputLocale is required when mode is "facts".');
      return;
    }

    let token: string;
    try {
      token = await ensureToken(active.id);
    } catch (e: any) {
      setError(`Couldn't mint token: ${e?.message ?? String(e)}`);
      return;
    }

    // Prefer the server-issued websocketUrl when we have one (set after Create new).
    // For a hand-picked existing interaction we never saw the create response, so
    // construct manually using the documented /transcribe-style URL shape.
    const url = websocketUrl
      ? appendStreamsToken(websocketUrl, token)
      : buildStreamsUrlFallback({
          region: active.region,
          interactionId,
          tenant: active.tenant,
          accessToken: token,
        });

    // Pick audioFormat up front. Two paths:
    //  - Mic: webm/opus from MediaRecorder. Static MIME check doesn't need mic permission,
    //    so we can declare it in the config *before* CONFIG_ACCEPTED.
    //  - File: raw 16-bit PCM at 16 kHz mono. Single decode, no re-encoding — the docs
    //    flag this as the highest-quality option, and it avoids the gibberish we got from
    //    re-encoding m4a → opus through MediaRecorder.
    // Either way: declaring audioFormat explicitly skips server-side ffprobe, which the
    // docs warn "in some cases might error silently" for streamed containers.
    const recorderMime = audioSource === "mic" ? pickMimeType() : "";
    const audioFormat =
      audioSource === "file"
        ? FILE_AUDIO_FORMAT
        : recorderMime
          ? recorderMime.replace(/;\s*/g, "; ").trim() // docs use "audio/webm; codecs=opus" (with space)
          : "";

    const streamConfig: StreamConfig = {
      type: "config",
      configuration: {
        transcription: {
          primaryLanguage: config.primaryLanguage,
          isDiarization: config.isDiarization || undefined,
          // Every mono example in /stt/audio includes this default participant. The docs
          // don't say "required" but it's present in every reference example, so we mirror.
          participants: [{ channel: 0, role: "multiple" }],
        },
        mode: {
          type: config.mode,
          ...(config.mode === "facts" ? { outputLocale: config.outputLocale } : {}),
          ...(config.mode === "facts" && config.factGenerationInterval
            ? { factGenerationInterval: config.factGenerationInterval }
            : {}),
        },
        ...(config.retentionPolicy !== "retain" ? { retentionPolicy: config.retentionPolicy } : {}),
        ...(audioFormat ? { audioFormat } : {}),
        ...(config.audioEventsEnabled ? { audioEvents: { enabled: true } } : {}),
      },
    };

    // 1) open WS, send config, wait for CONFIG_ACCEPTED. The docs are explicit: no audio
    //    before CONFIG_ACCEPTED. Starting the mic any earlier means the first chunk
    //    (which contains the WebM container headers ffprobe needs to identify the format)
    //    arrives at the server before it's ready to decode, and the whole stream is silent.
    const client = new StreamsClient({
      onStatusChange: (s) => {
        setStatus(s);
        // When status reaches "closed" (either via the server's ENDED frame in
        // handleMessage, or via a real TCP close), release our side of the socket and
        // drop the ref so the next Start gets a fresh client. NOTE: we must NOT pre-close
        // the WS from stopEverything — the server needs the WS open long enough to
        // deliver final transcripts/facts after receiving `end`.
        if (s === "closed") {
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

    // 2) NOW start the source. CONFIG_ACCEPTED has arrived; sendAudio is safe.
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
          // When the file finishes playing naturally, flush + close like the user hit End.
          onEnded: () => stopEverything(),
        });
        recorderRef.current = fr;
        await fr.start({ file: audioFile });
      } else {
        // Pin the recorder to the same MIME we declared in audioFormat — otherwise
        // MediaRecorder could re-negotiate and we'd be lying to the server about the codec.
        const mic = new MicRecorder({
          onChunk,
          onError: onSourceError,
          onLevel,
        });
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

    // 3) tick the elapsed timer
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
    // Send `end` and DO NOT close the WS — the server still owes us final transcripts/facts
    // and an ENDED frame. The onStatusChange handler in start() closes our side when the
    // server transitions us to "closed".
    try {
      clientRef.current?.end();
    } catch {
      /* ignore */
    }
    // Safety net: if the server hangs and never sends ENDED, force-close after 20s.
    const stalledClient = clientRef.current;
    if (stalledClient) {
      window.setTimeout(() => {
        if (clientRef.current === stalledClient && stalledClient.currentStatus !== "closed") {
          try {
            stalledClient.close();
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
  const canStart = !isLive && !!active && !!interactionId && (audioSource === "mic" || !!audioFile);

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Stream — live transcripts &amp; facts
        </h1>
        <p className="mt-1 text-sm text-muted-700">
          WSS connection to{" "}
          <code className="font-mono">/audio-bridge/v2/interactions/&#123;id&#125;/streams</code>.
          Pick an interaction, configure the stream, then hold a conversation — transcripts come
          back every ~3s, facts every ~60s.
        </p>
      </header>

      {/* --- INTERACTION --- */}
      <section className="rounded-xl border border-muted-300/40 bg-paper p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-ink">Interaction</h2>
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Label>id</Label>
            <Pill tone="neutral">uuid</Pill>
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
              Required
            </span>
            <div className="grow" />
            <button
              onClick={createInteraction}
              disabled={creating || !active}
              className="rounded-lg border border-muted-300 bg-paper px-3 py-1 text-xs font-medium text-ink hover:bg-paper-muted disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create new interaction"}
            </button>
          </div>
          <ParamPicker
            picker={interactionPicker}
            value={interactionId}
            onChange={(v) => {
              const next = String(v);
              setInteractionId((prev) => {
                // Any cached websocketUrl belonged to the previous interaction — drop it
                // when the id changes so we fall back to manual URL construction.
                if (prev !== next) setWebsocketUrl("");
                return next;
              });
            }}
            parentValues={pickerValues}
          />
          {createError && <p className="text-xs text-red-700">{createError}</p>}
        </div>
      </section>

      {/* --- CONFIGURATION --- */}
      <section className="rounded-xl border border-muted-300/40 bg-paper p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-ink">Configuration</h2>
        <div className="grid gap-4">
          <Row label="primaryLanguage" kind="enum" required help="Spoken language of the audio.">
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
            label="mode.type"
            kind="enum"
            required
            help="transcription = transcripts only · facts = transcripts + extracted clinical facts."
          >
            <Select
              value={config.mode}
              onChange={(e) => setConfig({ ...config, mode: e.target.value as ModeChoice })}
            >
              <option value="facts">facts (transcripts + facts)</option>
              <option value="transcription">transcription (transcripts only)</option>
            </Select>
          </Row>

          {config.mode === "facts" && (
            <Row
              label="mode.outputLocale"
              kind="enum"
              required
              help="Language the extracted facts are written in. Often the same as primaryLanguage."
            >
              <Select
                value={config.outputLocale}
                onChange={(e) => setConfig({ ...config, outputLocale: e.target.value })}
              >
                {LANGUAGE_CODES.map((c) => (
                  <option key={c} value={c}>
                    {LANGUAGE_LABELS[c] ?? c}
                  </option>
                ))}
              </Select>
            </Row>
          )}

          {config.mode === "facts" && (
            <Row
              label="mode.factGenerationInterval"
              kind="enum"
              help="fixed (default, ~60s) · fast_init (logarithmic: ~10s → 20s → 26s, ramps to 60s)."
            >
              <Select
                value={config.factGenerationInterval}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    factGenerationInterval: e.target
                      .value as Configuration["factGenerationInterval"],
                  })
                }
              >
                <option value="">— default (fixed) —</option>
                <option value="fixed">fixed</option>
                <option value="fast_init">fast_init</option>
              </Select>
            </Row>
          )}

          <Row
            label="transcription.isDiarization"
            kind="bool"
            help="Speaker separation on mono audio."
          >
            <CheckBox
              checked={config.isDiarization}
              onChange={(v) => setConfig({ ...config, isDiarization: v })}
            />
          </Row>

          <Row
            label="retentionPolicy"
            kind="enum"
            help="retain (default) = stored in Corti DB. none = ephemeral, not saved."
          >
            <Select
              value={config.retentionPolicy}
              onChange={(e) =>
                setConfig({ ...config, retentionPolicy: e.target.value as "retain" | "none" })
              }
            >
              <option value="retain">retain</option>
              <option value="none">none</option>
            </Select>
          </Row>

          <Row
            label="audioEvents.enabled"
            kind="bool"
            help="When true, server pushes audio quality / speech-activity events."
          >
            <CheckBox
              checked={config.audioEventsEnabled}
              onChange={(v) => setConfig({ ...config, audioEventsEnabled: v })}
            />
          </Row>
        </div>
      </section>

      {/* --- STREAM CONTROLS --- */}
      <section className="rounded-xl border border-muted-300/40 bg-paper p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-ink">Stream</h2>
        <div className="grid gap-3">
          <SourcePicker
            source={audioSource}
            disabled={isLive}
            file={audioFile}
            fileMeta={audioFileMeta}
            inputDevices={audioInputDevices}
            selectedDeviceId={selectedDeviceId}
            needsMicPermission={needsMicPermission}
            onDeviceChange={setSelectedDeviceId}
            onGrantPermission={grantMicPermission}
            onSourceChange={(s) => {
              setAudioSource(s);
              if (s === "mic") {
                setAudioFile(null);
                setAudioFileMeta(null);
              }
            }}
            onFileChange={async (f) => {
              setAudioFile(f);
              setAudioFileMeta(f ? { name: f.name, bytes: f.size, durationSec: null } : null);
              if (f) {
                // Best-effort duration probe via a throwaway <audio> element. If the browser
                // can't decode the container at all, we still let the user try Start — Web
                // Audio's decodeAudioData covers a wider set of codecs than HTMLAudioElement.
                try {
                  const url = URL.createObjectURL(f);
                  const a = new Audio();
                  a.preload = "metadata";
                  a.src = url;
                  await new Promise<void>((resolve, reject) => {
                    a.onloadedmetadata = () => resolve();
                    a.onerror = () => reject(new Error("metadata"));
                  });
                  const dur = isFinite(a.duration) ? a.duration : null;
                  setAudioFileMeta({ name: f.name, bytes: f.size, durationSec: dur });
                  URL.revokeObjectURL(url);
                } catch {
                  /* leave durationSec null */
                }
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={start} disabled={!canStart}>
              {audioSource === "file" ? "▶ Play & stream" : "● Start recording"}
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

// ---- subcomponents ----

function Row({
  label,
  kind,
  required,
  help,
  children,
}: {
  label: string;
  kind: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label>{label}</Label>
        <Pill tone="neutral">{kind}</Pill>
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

function SourcePicker({
  source,
  disabled,
  file,
  fileMeta,
  inputDevices,
  selectedDeviceId,
  needsMicPermission,
  onSourceChange,
  onFileChange,
  onDeviceChange,
  onGrantPermission,
}: {
  source: AudioSource;
  disabled: boolean;
  file: File | null;
  fileMeta: { name: string; durationSec: number | null; bytes: number } | null;
  inputDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  needsMicPermission: boolean;
  onSourceChange: (s: AudioSource) => void;
  onFileChange: (f: File | null) => void;
  onDeviceChange: (id: string) => void;
  onGrantPermission: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-muted-300/40 bg-paper-muted p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-500">
          Source
        </span>
        <SegTab active={source === "mic"} onClick={() => onSourceChange("mic")} disabled={disabled}>
          Microphone
        </SegTab>
        <SegTab
          active={source === "file"}
          onClick={() => onSourceChange("file")}
          disabled={disabled}
        >
          Audio file
        </SegTab>
        {source === "mic" && (
          <>
            {needsMicPermission ? (
              <button
                onClick={onGrantPermission}
                disabled={disabled}
                className="rounded-md border border-muted-300 bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-paper-muted disabled:opacity-50"
              >
                Grant mic permission to list devices
              </button>
            ) : (
              <select
                value={selectedDeviceId}
                disabled={disabled}
                onChange={(e) => onDeviceChange(e.target.value)}
                className="rounded-md border border-muted-300 bg-paper px-2 py-1 text-xs text-ink disabled:opacity-50"
              >
                <option value="">System default</option>
                {inputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `(unnamed input ${d.deviceId.slice(0, 6)}…)`}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        {source === "file" && (
          <>
            <input
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.webm"
              disabled={disabled}
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              className="block text-xs text-muted-700 file:mr-2 file:rounded-md file:border file:border-muted-300 file:bg-paper file:px-3 file:py-1 file:text-xs file:font-medium file:text-ink hover:file:bg-paper-muted"
            />
            {file && (
              <span className="font-mono text-[11px] text-muted-700">
                {fileMeta?.durationSec != null ? `${fileMeta.durationSec.toFixed(1)}s · ` : ""}
                {formatBytes(fileMeta?.bytes ?? file.size)}
                {fileMeta?.durationSec != null && fileMeta.durationSec < 4
                  ? " · padded to 4.0s"
                  : ""}
              </span>
            )}
          </>
        )}
      </div>
      {source === "mic" && (
        <>
          <p className="text-[11px] text-muted-500">
            Pick any audio input — including a virtual device like <strong>BlackHole 2ch</strong>{" "}
            (macOS) or <strong>VB-Cable</strong> (Windows) — to stream a file playing in
            QuickTime/VLC/Spotify without changing system audio defaults.
          </p>
          <details className="text-[11px] text-muted-500">
            <summary className="cursor-pointer text-muted-700 hover:text-ink">
              Set up BlackHole (macOS) to stream files →
            </summary>
            <ol className="ml-4 mt-2 list-decimal space-y-1 text-muted-700">
              <li>
                Install: <code className="font-mono text-[10px]">brew install blackhole-2ch</code>{" "}
                (or download from{" "}
                <a
                  className="underline"
                  href="https://existential.audio/blackhole/"
                  target="_blank"
                  rel="noreferrer"
                >
                  existential.audio/blackhole
                </a>
                ).
              </li>
              <li>
                Open <strong>Audio MIDI Setup</strong> → click <strong>+</strong> →{" "}
                <strong>Create Multi-Output Device</strong>. Check both your speakers <em>and</em>{" "}
                BlackHole 2ch. This lets you hear playback while it's also captured.
              </li>
              <li>
                System Settings → Sound → <strong>Output</strong>: select that Multi-Output Device.
                Leave <strong>Input</strong> on your normal mic.
              </li>
              <li>
                Back here, select <strong>BlackHole 2ch</strong> in the dropdown above. Click{" "}
                <strong>Start recording</strong>.
              </li>
              <li>
                Play the audio file in QuickTime / VLC / any app. It routes through BlackHole into
                the WebSocket. End the stream when the file finishes.
              </li>
            </ol>
            <p className="ml-4 mt-2 text-muted-500">
              Windows equivalent: install{" "}
              <a
                className="underline"
                href="https://vb-audio.com/Cable/"
                target="_blank"
                rel="noreferrer"
              >
                VB-Audio Virtual Cable
              </a>
              , set its output as system default, pick <strong>CABLE Output</strong> here.
            </p>
          </details>
        </>
      )}
      {source === "file" && (
        <p className="text-[11px] text-muted-500">
          File is decoded once, resampled to 16 kHz mono, then streamed as raw PCM at real-time pace
          — no re-encoding through MediaRecorder, so transcription quality matches the source. Clips
          under 4s are padded with trailing silence so the recognizer's rolling window has enough
          material to fire. .wav / .mp3 / .m4a / .webm work in all browsers; .flac / .ogg depend on
          browser codecs.
        </p>
      )}
    </div>
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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

function OutputPanel({ events }: { events: StreamEvent[] }) {
  const [tab, setTab] = useState<OutputTab>("transcripts");
  const { transcripts, facts } = useMemo(() => extractContent(events), [events]);

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-1 border-b border-muted-300/60 text-sm">
        <Tab active={tab === "transcripts"} onClick={() => setTab("transcripts")}>
          Transcripts <span className="text-muted-500">({transcripts.length})</span>
        </Tab>
        <Tab active={tab === "facts"} onClick={() => setTab("facts")}>
          Facts <span className="text-muted-500">({facts.length})</span>
        </Tab>
        <Tab active={tab === "raw"} onClick={() => setTab("raw")}>
          Raw events <span className="text-muted-500">({events.length})</span>
        </Tab>
      </div>

      {tab === "transcripts" && (
        <div className="grid gap-1">
          {transcripts.length === 0 && (
            <EmptyState>Transcripts will appear here every ~3 seconds.</EmptyState>
          )}
          {transcripts.map((t, i) => (
            <div key={i} className="rounded border border-muted-300/40 bg-paper-muted p-2 text-sm">
              {t.speaker && (
                <span className="mr-2 rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-700">
                  {t.speaker}
                </span>
              )}
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "facts" && (
        <div className="grid gap-1">
          {facts.length === 0 && (
            <EmptyState>Facts appear every ~60s (or ~10s with fast_init).</EmptyState>
          )}
          {facts.map((f, i) => (
            <div key={i} className="rounded border border-muted-300/40 bg-paper-muted p-2 text-sm">
              {f.group && (
                <span className="mr-2 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                  {f.group}
                </span>
              )}
              <span>{f.text}</span>
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

// Flatten the documented streams payloads into uniform shapes for display.
// Shapes per /api-reference/streams:
//   { type: "transcript", data: [{ transcript, speakerId, participant: {channel}, time, ... }] }
//   { type: "facts",      fact: [{ text, group, ... }] }           // NB: "fact" is singular
function extractContent(events: StreamEvent[]): {
  transcripts: { text: string; speaker?: string }[];
  facts: { text: string; group?: string }[];
} {
  const transcripts: { text: string; speaker?: string }[] = [];
  const facts: { text: string; group?: string }[] = [];
  for (const e of events) {
    const t = String(e.type ?? "").toLowerCase();
    if (t === "transcript" || t === "transcripts") {
      const segs: any[] = Array.isArray((e as any).data) ? (e as any).data : [];
      for (const seg of segs) {
        const text = typeof seg?.transcript === "string" ? seg.transcript : seg?.text;
        if (typeof text !== "string") continue;
        // speakerId === -1 means diarization is off — show nothing instead of a
        // misleading "spk -1" badge. Otherwise prefer the speaker id; fall back to channel.
        const sid = seg?.speakerId;
        const speaker =
          typeof sid === "number" && sid >= 0
            ? `spk ${sid}`
            : typeof seg?.participant?.channel === "number"
              ? `ch ${seg.participant.channel}`
              : undefined;
        transcripts.push({ text, speaker });
      }
    } else if (t === "facts" || t === "fact") {
      // Docs spell the container key "fact" (singular). Accept "facts" too just in case.
      const items: any[] = Array.isArray((e as any).fact)
        ? (e as any).fact
        : Array.isArray((e as any).facts)
          ? (e as any).facts
          : Array.isArray((e as any).data)
            ? (e as any).data
            : [];
      for (const f of items) {
        if (typeof f?.text === "string") {
          facts.push({ text: f.text, group: typeof f?.group === "string" ? f.group : undefined });
        }
      }
    }
  }
  return { transcripts, facts };
}

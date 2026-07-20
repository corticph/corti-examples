/**
 * Applet — CONCEPT: time-ordered diarized transcript rendering.
 *
 * /streams transcript messages carry an ARRAY of finalized segments that can
 * arrive out of chronological order across speakers. This applet merges them
 * with mergeDiarizedSegments (ordered by time.start) and renders speaker runs,
 * rather than appending in arrival order. It also shows facts grouped by
 * category when `mode: facts` is selected.
 */

import { type Corti, CortiClient } from "@corti/sdk";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CortiAmbientComponent } from "../_shared/cortiAmbientReact";
import {
  type DiarizedSegment,
  groupBySpeakerRuns,
  mergeDiarizedSegments,
} from "../_shared/diarizedTranscript";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { cn } from "../_shared/utils";
import { type AmbientSettings, buildStreamConfig, DEFAULT_AMBIENT_SETTINGS } from "./config";

function speakerLabel(speakerId: number, channel: number): string {
  if (speakerId === -1) {
    return `Channel ${channel}`;
  }
  return `Speaker ${speakerId}`;
}

async function createInteraction(client: CortiClient): Promise<string> {
  const data = await client.interactions.create({
    encounter: {
      identifier: `corti-examples-${Date.now()}`,
      status: "planned",
      type: "consultation",
      period: {
        startedAt: new Date(),
        endedAt: new Date(Date.now() + 60 * 60000),
      },
      title: "Corti Examples Session",
    },
    patient: {
      identifier: "test-patient-1",
      name: "Test Patient",
      gender: "unknown",
      birthDate: new Date("1990-01-01T00:00:00Z"),
      pronouns: "They/Them",
    },
  });
  return data.interactionId;
}

export function AmbientDiarized() {
  const { authConfig, refreshAccessToken, sdkEnvironment } = useCortiAccessToken();
  const client = useMemo(
    () => new CortiClient({ environment: sdkEnvironment, auth: { refreshAccessToken } }),
    [sdkEnvironment, refreshAccessToken],
  );
  const [settings, setSettings] = useState<AmbientSettings>(DEFAULT_AMBIENT_SETTINGS);
  const [interactionId, setInteractionId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const [segments, setSegments] = useState<DiarizedSegment[]>([]);
  const [facts, setFacts] = useState<Corti.StreamFact[]>([]);
  // Create exactly one interaction for this applet mount, even if auth state
  // churns while the request is in flight.
  const requestedRef = useRef(false);

  // /streams requires an interaction id before connecting.
  useEffect(() => {
    if (requestedRef.current) {
      return;
    }
    requestedRef.current = true;
    let cancelled = false;
    setCreating(true);
    createInteraction(client)
      .then((interactionId) => {
        if (!cancelled) {
          setInteractionId(interactionId);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message ?? "Failed to create interaction");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCreating(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTranscript = useCallback((e: CustomEvent) => {
    const data = e.detail?.data;
    if (!Array.isArray(data)) {
      return; // /streams sends an array
    }
    setSegments((prev) => mergeDiarizedSegments(prev, data));
  }, []);

  const handleFacts = useCallback((e: CustomEvent) => {
    const incoming = e.detail?.fact;
    if (Array.isArray(incoming)) {
      setFacts(incoming);
    }
  }, []);

  const speakerRuns = useMemo(() => groupBySpeakerRuns(segments), [segments]);

  const factGroups = useMemo(() => {
    const grouped = new Map<string, Corti.StreamFact[]>();
    for (const f of facts) {
      if (f.isDiscarded) {
        continue;
      }
      const list = grouped.get(f.group) ?? [];
      list.push(f);
      grouped.set(f.group, list);
    }
    return Array.from(grouped.entries());
  }, [facts]);

  const config = useMemo(() => buildStreamConfig(settings), [settings]);

  const update = (patch: Partial<AmbientSettings>) => setSettings((s) => ({ ...s, ...patch }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Diarized ambient transcript</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Segments are ordered by start time (not arrival order) and grouped by speaker. Toggle
          diarization, multichannel roles, and facts mode.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-6 rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Switch
            id="multichannel"
            checked={settings.isMultichannel}
            onCheckedChange={(v) => update({ isMultichannel: v })}
          />
          <Label htmlFor="multichannel" className="text-sm">
            Multichannel (doctor/patient)
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="diarization"
            checked={settings.isDiarization}
            disabled={settings.isMultichannel}
            onCheckedChange={(v) => update({ isDiarization: v })}
          />
          <Label htmlFor="diarization" className="text-sm">
            Diarization
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="facts-mode"
            checked={settings.mode === "facts"}
            onCheckedChange={(v) => update({ mode: v ? "facts" : "transcription" })}
          />
          <Label htmlFor="facts-mode" className="text-sm">
            Facts mode
          </Label>
        </div>
      </div>

      {error && <p className="text-sm text-variant-error-foreground">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-border bg-background p-3">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Transcript</h3>
          {speakerRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transcript yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {speakerRuns.map((run, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: runs have no stable id; speaker+channel may repeat across segments
                <div key={i} className="text-sm">
                  <span className="font-semibold text-corti-lime">
                    {speakerLabel(run.speakerId, run.channel)}:
                  </span>{" "}
                  <span className="text-foreground">
                    {run.segments.map((s) => s.transcript).join(" ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-md border border-border bg-background p-3">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Facts</h3>
          {factGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {settings.mode === "facts" ? "No facts yet." : "Enable facts mode to extract facts."}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {factGroups.map(([group, items]) => (
                <div key={group}>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{group}</p>
                  <ul className="ml-4 list-disc text-sm text-foreground">
                    {items.map((f) => (
                      <li key={f.id}>{f.text}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {creating
            ? "Creating interaction…"
            : interactionId
              ? `Interaction ${interactionId.slice(0, 8)}…`
              : "No interaction"}
        </span>
        {interactionId ? (
          <CortiAmbientComponent
            authConfig={authConfig}
            interactionId={interactionId}
            ambientConfig={config}
            settingsEnabled={["device", "language"]}
            onTranscript={handleTranscript}
            onFacts={handleFacts}
          />
        ) : (
          <Loader2 className={cn("h-5 w-5", creating && "animate-spin")} aria-hidden />
        )}
      </div>
    </div>
  );
}

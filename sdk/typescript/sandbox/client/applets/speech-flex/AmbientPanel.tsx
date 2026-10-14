/**
 * Ambient collapsible panels — transcript, facts, and recording status bar.
 *
 * These render below the dictation editor (which is itself collapsible) when
 * a visit is selected. The recording status bar is only shown in ambient
 * mode. The transcript panel supports two modes toggled by a button pair:
 * Ambient (live diarized transcript) and Paste (textarea for pasting a
 * plain-text transcript, parsed into diarized segments). The facts panel is
 * collapsible and visible whenever there's content, regardless of mode.
 *
 * State (segments, facts, clips, isRecording, pastedText, panelMode) is
 * owned by the parent (SpeechFlex) so it survives mode toggles and clears on
 * visit change.
 */

import type { Corti } from "@corti/sdk";
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Radio, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  type DiarizedSegment,
  groupBySpeakerRuns,
  mergeDiarizedSegments,
} from "../_shared/diarizedTranscript";
import { cn } from "../_shared/utils";

/** Which transcript source the panel is showing. */
export type TranscriptPanelMode = "ambient" | "paste";

function speakerLabel(speakerId: number, channel: number): string {
  if (speakerId === -1) {
    return `Channel ${channel}`;
  }
  return `Speaker ${speakerId}`;
}

export interface AmbientClip {
  clipIndex: number;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
}

/** Ambient event handler callbacks returned by useAmbientHandlers. */
export interface AmbientHandlers {
  handleTranscript: (e: CustomEvent) => void;
  handleFacts: (e: CustomEvent) => void;
  handleRecordingState: (e: CustomEvent) => void;
}

/* ------------------------------------------------------------------ */
/* Recording status bar                                               */
/* ------------------------------------------------------------------ */

export function RecordingStatusBar({
  isRecording,
  clips,
}: {
  isRecording: boolean;
  clips: AmbientClip[];
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
      {isRecording ? (
        <>
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <span className="text-sm font-medium text-foreground">Recording</span>
        </>
      ) : (
        <>
          <Radio className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {clips.length > 0
              ? `${clips.length} clip${clips.length > 1 ? "s" : ""} recorded`
              : "Ready to record"}
          </span>
        </>
      )}
      {clips.length > 0 && (
        <div className="ml-auto flex flex-wrap gap-1.5">
          {clips.map((clip) => (
            <span
              key={clip.clipIndex}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground"
            >
              Clip {clip.clipIndex + 1}
              {clip.durationMs != null && ` · ${Math.round(clip.durationMs / 1000)}s`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Collapsible wrapper                                                */
/* ------------------------------------------------------------------ */

export function CollapsibleSection({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="rounded-md border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {count != null && count > 0 && (
          <span className="text-xs text-muted-foreground">{count}</span>
        )}
      </button>
      {open && <div className="border-t border-border p-3">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Transcript panel                                                   */
/* ------------------------------------------------------------------ */

/** Speaker-run list shared by both panel modes so a parsed paste previews the same way as ambient output. */
function SpeakerRuns({ runs }: { runs: ReturnType<typeof groupBySpeakerRuns> }) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No transcript yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {runs.map((run, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: speaker runs have no stable id
        <div key={i} className="text-sm">
          <span className="font-semibold text-lime-600 dark:text-corti-lime">
            {speakerLabel(run.speakerId, run.channel)}:
          </span>{" "}
          <span className="text-foreground">{run.segments.map((s) => s.transcript).join(" ")}</span>
        </div>
      ))}
    </div>
  );
}

export function TranscriptPanel({
  segments,
  mode,
  onModeChange,
  pastedText,
  onPastedTextChange,
}: {
  /** The active segments (ambient or parsed-paste, already resolved by parent). */
  segments: DiarizedSegment[];
  /** Which transcript source is currently shown. */
  mode: TranscriptPanelMode;
  onModeChange: (mode: TranscriptPanelMode) => void;
  /** Pasted transcript text (the textarea value). */
  pastedText: string;
  onPastedTextChange: (text: string) => void;
}) {
  const speakerRuns = useMemo(() => groupBySpeakerRuns(segments), [segments]);
  return (
    <CollapsibleSection title="Transcript" count={speakerRuns.length}>
      {/* Mode switch — Ambient (live scribe output) vs Paste (paste-in text). */}
      <div className="mb-3 flex gap-1">
        {(["ambient", "paste"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={cn(
              "rounded border px-2.5 py-1 text-xs font-medium transition-colors",
              m === mode
                ? "border-lime-600 bg-lime-600/10 text-foreground dark:border-corti-lime dark:bg-corti-lime/10"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {m === "ambient" ? "Ambient recording" : "Paste transcript"}
          </button>
        ))}
      </div>

      {mode === "paste" ? (
        <Textarea
          value={pastedText}
          onChange={(e) => onPastedTextChange(e.target.value)}
          placeholder={
            'Paste a transcript here. Lines like "Speaker 1: …" are split into speakers.'
          }
          className="min-h-[140px]"
        />
      ) : (
        <div className="max-h-[300px] overflow-auto">
          <SpeakerRuns runs={speakerRuns} />
        </div>
      )}
    </CollapsibleSection>
  );
}

/* ------------------------------------------------------------------ */
/* Facts panel                                                        */
/* ------------------------------------------------------------------ */

export function FactsPanel({
  facts,
  setFacts,
}: {
  facts: Corti.StreamFact[];
  setFacts: React.Dispatch<React.SetStateAction<Corti.StreamFact[]>>;
}) {
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [editingFactText, setEditingFactText] = useState("");
  const [newFactText, setNewFactText] = useState("");
  const [newFactGroup, setNewFactGroup] = useState("");

  const factGroups = useMemo(() => {
    const grouped = new Map<string, Corti.StreamFact[]>();
    for (const f of facts) {
      const list = grouped.get(f.group) ?? [];
      list.push(f);
      grouped.set(f.group, list);
    }
    return Array.from(grouped.entries());
  }, [facts]);

  const activeCount = facts.filter((f) => !f.isDiscarded).length;

  const toggleDiscard = (id: string) => {
    setFacts((prev) => prev.map((f) => (f.id === id ? { ...f, isDiscarded: !f.isDiscarded } : f)));
  };

  const startEdit = (fact: Corti.StreamFact) => {
    setEditingFactId(fact.id);
    setEditingFactText(fact.text);
  };

  const saveEdit = () => {
    if (!editingFactId) {
      return;
    }
    setFacts((prev) =>
      prev.map((f) =>
        f.id === editingFactId ? { ...f, text: editingFactText, source: "user" } : f,
      ),
    );
    setEditingFactId(null);
    setEditingFactText("");
  };

  const addFact = () => {
    const text = newFactText.trim();
    if (!text) {
      return;
    }
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setFacts((prev) => [
      ...prev,
      {
        id,
        text,
        group: newFactGroup.trim() || "user",
        groupId: newFactGroup.trim() || "user",
        isDiscarded: false,
        source: "user",
        createdAt: new Date() as unknown as Date,
      },
    ]);
    setNewFactText("");
    setNewFactGroup("");
  };

  return (
    <CollapsibleSection title="Facts" count={activeCount}>
      <div className="max-h-[300px] overflow-auto">
        {factGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No facts yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {factGroups.map(([group, items]) => (
              <div key={group}>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  {group}
                </p>
                <ul className="flex flex-col gap-1">
                  {items.map((fact) => (
                    <li
                      key={fact.id}
                      className={cn(
                        "flex items-start gap-1.5 text-sm",
                        fact.isDiscarded && "opacity-40 line-through",
                      )}
                    >
                      {editingFactId === fact.id ? (
                        <div className="flex flex-1 items-center gap-1">
                          <input
                            type="text"
                            value={editingFactText}
                            onChange={(e) => setEditingFactText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                            className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-sm text-foreground outline-none focus:border-lime-600 dark:focus:border-corti-lime"
                          />
                          <button
                            type="button"
                            onClick={saveEdit}
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingFactId(null)}
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleDiscard(fact.id)}
                            title={fact.isDiscarded ? "Undiscard" : "Discard"}
                            className={cn(
                              "mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border transition-colors",
                              fact.isDiscarded
                                ? "border-border bg-transparent"
                                : "border-lime-600 bg-lime-600 dark:border-corti-lime dark:bg-corti-lime",
                            )}
                          />
                          <span
                            className={cn(
                              "flex-1 text-foreground",
                              fact.source === "user" && "italic text-muted-foreground",
                            )}
                          >
                            {fact.text}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEdit(fact)}
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add new fact */}
      <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-2">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={newFactGroup}
            onChange={(e) => setNewFactGroup(e.target.value)}
            placeholder="group"
            className="w-20 rounded border border-border bg-background px-1.5 py-1 text-xs text-foreground outline-none focus:border-lime-600 dark:focus:border-corti-lime"
          />
          <input
            type="text"
            value={newFactText}
            onChange={(e) => setNewFactText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFact()}
            placeholder="Add a fact…"
            className="flex-1 rounded border border-border bg-background px-1.5 py-1 text-xs text-foreground outline-none focus:border-lime-600 dark:focus:border-corti-lime"
          />
          <button
            type="button"
            onClick={addFact}
            disabled={!newFactText.trim()}
            className="rounded border border-border p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            title="Add fact"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </CollapsibleSection>
  );
}

/* ------------------------------------------------------------------ */
/* Ambient event handlers hook                                        */
/* ------------------------------------------------------------------ */

export function useAmbientHandlers({
  setSegments,
  setFacts,
  clips,
  setClips,
  setIsRecording,
}: {
  setSegments: React.Dispatch<React.SetStateAction<DiarizedSegment[]>>;
  setFacts: React.Dispatch<React.SetStateAction<Corti.StreamFact[]>>;
  clips: AmbientClip[];
  setClips: React.Dispatch<React.SetStateAction<AmbientClip[]>>;
  setIsRecording: React.Dispatch<React.SetStateAction<boolean>>;
}): AmbientHandlers {
  const currentClipRef = useRef<AmbientClip | null>(null);

  const handleTranscript = useCallback(
    (e: CustomEvent) => {
      const data = e.detail?.data;
      if (!Array.isArray(data)) {
        return;
      }
      setSegments((prev) => mergeDiarizedSegments(prev, data));
    },
    [setSegments],
  );

  const handleFacts = useCallback(
    (e: CustomEvent) => {
      const incoming = e.detail?.fact;
      if (Array.isArray(incoming)) {
        setFacts(incoming);
      }
    },
    [setFacts],
  );

  const handleRecordingState = useCallback(
    (e: CustomEvent) => {
      const state = e.detail?.state;
      if (state === "recording") {
        setIsRecording(true);
        if (!currentClipRef.current) {
          currentClipRef.current = {
            clipIndex: clips.length,
            startedAt: Date.now(),
            endedAt: null,
            durationMs: null,
          };
        }
      } else if (state === "stopped") {
        setIsRecording(false);
        if (currentClipRef.current) {
          const clip = currentClipRef.current;
          clip.endedAt = Date.now();
          clip.durationMs = clip.endedAt - clip.startedAt;
          setClips((prev) => [...prev, clip]);
          currentClipRef.current = null;
        }
      }
    },
    [clips.length, setIsRecording, setClips],
  );

  return { handleTranscript, handleFacts, handleRecordingState };
}

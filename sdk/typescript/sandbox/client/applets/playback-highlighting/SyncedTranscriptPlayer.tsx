/**
 * Audio player with synchronized transcript highlighting.
 *
 * Renders a custom audio control bar (play/pause, scrubber, speed, time)
 * and a scrollable transcript area where each word/segment is an inline
 * `<span>`. The active segment — the last one whose `start` <= current
 * audio time — gets a highlight background + bold text.
 *
 * Click any word to seek the audio to that word's start time.
 * When diarization is enabled, speaker badges appear at speaker boundaries.
 *
 * Text presentation follows the spacing rules from the transcript handling
 * best-practices guide (https://docs.corti.ai/stt/best-practices-transcribe):
 * punctuation that should attach to the left (e.g. comma, period) gets no
 * preceding space; opening brackets/quotes get no following space; French
 * locale uses non-breaking space before `:`, `;`, `!`, `?`.
 *
 * Layout-shift prevention: each word span has constant horizontal padding
 * (`px-0.5`) at all times. Bold text is wider than normal text, but the
 * padding absorbs the difference — the span's outer box width doesn't
 * change when the active class toggles, so neighboring words never shift.
 *
 * Newlines in segment text (`\n` → line break, `\n\n` → paragraph break)
 * are rendered as `<br>` elements, preserving the transcript's structural
 * formatting.
 */

import { Download, Pause, Play } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { ScrollArea } from "../../components/ui/scroll-area";
import { cn } from "../../lib/utils";
import type { TranscriptSegment } from "./pipeline";
import type { DetectedCommand } from "./useLiveTranscript";
import { usePlaybackSync } from "./usePlaybackSync";

const SHOW_SEQUENCING_TIMELINE = false;

interface SyncedTranscriptPlayerProps {
  segments: TranscriptSegment[];
  audioUrl: string | null;
  diarize: boolean;
  wordLevel: boolean;
  primaryLanguage?: string;
  rawResponse?: unknown;
  transcriptId?: string;
  disabled?: boolean;
  commands?: DetectedCommand[];
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const SPEAKER_COLORS = [
  "text-blue-600 dark:text-blue-400",
  "text-purple-600 dark:text-purple-400",
  "text-emerald-600 dark:text-emerald-400",
  "text-orange-600 dark:text-orange-400",
  "text-pink-600 dark:text-pink-400",
  "text-cyan-600 dark:text-cyan-400",
];

const LEFT_ATTACH = new Set([",", ".", ":", ";", "!", "?", ")", "]", "}", "%"]);
const NO_SPACE_AFTER = new Set([
  "(",
  "[",
  "{",
  "\u201C",
  "\u201D",
  '"',
  "'",
  "\u00AB",
]);
const FRENCH_NBSP_BEFORE = new Set([":", ";", "!", "?"]);
const SENTENCE_END = new Set([".", "!", "?", "\u2026"]);

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\n" || ch === "\t" || ch === "\u00A0";
}

function capitalizeFirst(text: string): string {
  if (!text) {
    return text;
  }
  const match = text.match(/^(\s*)(\S)(.*)$/s);
  if (!match) {
    return text;
  }
  return match[1] + match[2].toUpperCase() + match[3];
}

function shouldCapitalize(prevText: string | null): boolean {
  if (!prevText) {
    return true;
  }
  const trimmed = prevText.trimEnd();
  if (trimmed === "") {
    return true;
  }
  const lastChar = trimmed[trimmed.length - 1];
  if (SENTENCE_END.has(lastChar)) {
    return true;
  }
  if (trimmed.endsWith("\n")) {
    return true;
  }
  return false;
}

function shouldPrependSpace(
  prevChar: string | null,
  nextChar: string,
  primaryLanguage?: string,
): string {
  if (!prevChar) {
    return "";
  }
  if (isWhitespace(prevChar)) {
    return "";
  }
  if (NO_SPACE_AFTER.has(prevChar)) {
    return "";
  }

  const lang = primaryLanguage?.toLowerCase();
  const isFrenchNbsp = lang === "fr" || lang === "fr-fr";

  if (isFrenchNbsp && FRENCH_NBSP_BEFORE.has(nextChar)) {
    return "\u00A0";
  }

  if (LEFT_ATTACH.has(nextChar)) {
    return "";
  }
  return " ";
}

function buildWordSpacing(
  prevText: string | null,
  currentText: string,
  primaryLanguage?: string,
): string {
  const prevChar = prevText ? prevText[prevText.length - 1] : null;
  const nextChar = currentText[0];
  return shouldPrependSpace(prevChar, nextChar, primaryLanguage);
}

function speakerColorClass(speakerId: number): string {
  const idx = Math.abs(speakerId) % SPEAKER_COLORS.length;
  return SPEAKER_COLORS[idx];
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function renderTextWithBreaks(text: string): React.ReactNode[] {
  const parts = text.split(/(\n+)/);
  const result: React.ReactNode[] = [];
  for (let j = 0; j < parts.length; j++) {
    const part = parts[j];
    if (part === "") {
      continue;
    }
    if (/^\n+$/.test(part)) {
      const count = part.length;
      for (let k = 0; k < count; k++) {
        result.push(<br key={`${j}-${k}`} />);
      }
    } else {
      result.push(part);
    }
  }
  return result;
}

function downloadTranscriptJson(transcriptId: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `corti-transcript-${transcriptId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function SyncedTranscriptPlayer({
  segments,
  audioUrl,
  diarize,
  wordLevel,
  primaryLanguage,
  rawResponse,
  transcriptId,
  disabled = false,
  commands,
}: SyncedTranscriptPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showJson, setShowJson] = useState(false);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const sortedSegments = useMemo(
    () => [...segments].sort((a, b) => a.start - b.start),
    [segments],
  );

  const { activeIndex, isPlaying } = usePlaybackSync(audioRef, sortedSegments);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  useLayoutEffect(() => {
    if (activeIndex === null) {
      return;
    }
    const el = wordRefs.current[activeIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  };

  const seekTo = (timeSec: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = timeSec;
      setCurrentTime(timeSec);
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const speakerBoundaries = useMemo(() => {
    if (!diarize) {
      return new Map<number, number>();
    }
    const boundaries = new Map<number, number>();
    let prevSpeaker: number | null = null;
    for (let i = 0; i < sortedSegments.length; i++) {
      const seg = sortedSegments[i];
      if (seg.speakerId !== prevSpeaker) {
        boundaries.set(i, seg.speakerId);
        prevSpeaker = seg.speakerId;
      }
    }
    return boundaries;
  }, [sortedSegments, diarize]);

  const currentTimeMs = currentTime * 1000;
  const activeCommandIndex = useMemo(() => {
    if (!commands || commands.length === 0) {
      return null;
    }
    for (let i = 0; i < commands.length; i++) {
      if (
        currentTimeMs >= commands[i].startMs &&
        currentTimeMs <= commands[i].endMs
      ) {
        return i;
      }
    }
    return null;
  }, [commands, currentTimeMs]);

  const timeline = useMemo(() => {
    type TimelineEntry = {
      type: "text" | "command";
      startMs: number;
      endMs: number;
      label: string;
      index: number;
    };
    const entries: TimelineEntry[] = [];
    for (let i = 0; i < sortedSegments.length; i++) {
      entries.push({
        type: "text",
        startMs: sortedSegments[i].start,
        endMs: sortedSegments[i].end,
        label: sortedSegments[i].text,
        index: i,
      });
    }
    if (commands) {
      for (let i = 0; i < commands.length; i++) {
        entries.push({
          type: "command",
          startMs: commands[i].startMs,
          endMs: commands[i].endMs,
          label: commands[i].id,
          index: i,
        });
      }
    }
    entries.sort((a, b) => a.startMs - b.startMs);
    return entries;
  }, [sortedSegments, commands]);

  return (
    <div className="flex flex-col gap-3">
      {/* biome-ignore lint/a11y/useMediaCaption: captions rendered via synced transcript UI */}
      <audio
        ref={audioRef}
        src={audioUrl ?? undefined}
        preload="auto"
        className="hidden"
      />

      <div
        className={cn(
          "flex items-center gap-3 rounded-md border border-border p-3",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <Button
          variant="outline"
          size="icon"
          onClick={togglePlay}
          disabled={disabled || !audioUrl}
          className="h-10 w-10 shrink-0 rounded-full"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 translate-x-0.5" />
          )}
        </Button>

        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {formatTime(currentTime)}
        </span>

        <div className="relative flex-1">
          <div className="h-1.5 w-full cursor-pointer rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-corti-lime"
              style={{ width: `${progress}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            value={currentTime}
            onChange={(e) => seekTo(Number(e.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {formatTime(duration)}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          {PLAYBACK_SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium transition-colors",
                s === speed
                  ? "bg-corti-lime/20 text-foreground ring-1 ring-inset ring-corti-lime/50"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {SHOW_SEQUENCING_TIMELINE && timeline.length > 0 && duration > 0 && (
        <div className="relative h-5 w-full overflow-hidden rounded-sm bg-muted/30">
          {timeline.map((entry) => {
            const left = (entry.startMs / (duration * 1000)) * 100;
            const width = Math.max(
              ((entry.endMs - entry.startMs) / (duration * 1000)) * 100,
              0.5,
            );
            const isActive =
              entry.type === "text"
                ? entry.index === activeIndex
                : entry.index === activeCommandIndex;
            return (
              <button
                key={`${entry.type}-${entry.startMs}`}
                type="button"
                onClick={() => seekTo(entry.startMs / 1000)}
                title={`${entry.type === "command" ? "⚙" : "¶"} ${entry.type === "command" ? entry.label : entry.label.slice(0, 40)} · ${formatTime(entry.startMs / 1000)}`}
                className={cn(
                  "absolute h-5 rounded-sm text-[10px] leading-5 transition-colors",
                  entry.type === "command"
                    ? isActive
                      ? "bg-amber-500/40 ring-1 ring-amber-500/50"
                      : "bg-amber-500/15 hover:bg-amber-500/25"
                    : isActive
                      ? "bg-lime-600/40 ring-1 ring-lime-600/50"
                      : "bg-muted hover:bg-muted/80",
                )}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  minWidth: "2px",
                }}
              />
            );
          })}
        </div>
      )}

      <div className="max-h-[420px] overflow-y-auto rounded-md border border-border p-4 text-sm leading-loose">
        {sortedSegments.length === 0 && (
          <p className="text-muted-foreground">
            No speech detected in this recording.
          </p>
        )}
        {sortedSegments.map((seg, i) => {
          const isActive = i === activeIndex;
          const showSpeaker = speakerBoundaries.has(i);
          const speakerId = seg.speakerId ?? 0;
          const prevSegText = i > 0 ? sortedSegments[i - 1].text : null;
          const separator = buildWordSpacing(
            prevSegText,
            seg.text,
            primaryLanguage,
          );
          const displayText = shouldCapitalize(prevSegText)
            ? capitalizeFirst(seg.text)
            : seg.text;

          return (
            <span key={`${seg.start}-${seg.end}`}>
              {showSpeaker && (
                <span className="mb-1 mt-2 flex items-center gap-1">
                  <span
                    className={cn(
                      "rounded-full border border-border px-1.5 py-0.5 font-mono text-[10px]",
                      speakerColorClass(speakerId),
                    )}
                  >
                    speaker {speakerId}
                  </span>
                </span>
              )}
              {separator}
              {/* biome-ignore lint/a11y/useSemanticElements: inline text span needs onClick */}
              <span
                ref={(el) => {
                  wordRefs.current[i] = el;
                }}
                role="button"
                tabIndex={0}
                onClick={() => seekTo(seg.start / 1000)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    seekTo(seg.start / 1000);
                  }
                }}
                title={`${formatTime(seg.start / 1000)} – ${formatTime(seg.end / 1000)}`}
                className={cn(
                  "cursor-pointer rounded-sm px-0.5 transition-colors",
                  isActive
                    ? "bg-lime-600/25 font-semibold text-foreground shadow-[0_0_0_1px_rgba(101,163,13,0.4)] dark:bg-corti-lime/25 dark:shadow-[0_0_0_1px_rgba(167,243,106,0.5)]"
                    : "font-normal text-foreground hover:bg-muted/60",
                )}
              >
                {renderTextWithBreaks(displayText)}
              </span>
            </span>
          );
        })}
      </div>

      {commands && commands.length > 0 && (
        <div className="rounded-md border border-border p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            Detected commands ({commands.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {commands.map((cmd, i) => {
              const isActive = i === activeCommandIndex;
              return (
                <button
                  key={`${cmd.id}-${cmd.startMs}`}
                  type="button"
                  onClick={() => seekTo(cmd.startMs / 1000)}
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3 py-1.5 text-left text-sm transition-colors",
                    isActive
                      ? "border-lime-600/50 bg-lime-600/10 dark:border-corti-lime/50 dark:bg-corti-lime/10"
                      : "border-transparent hover:bg-accent",
                  )}
                >
                  <span className="shrink-0 font-mono text-xs font-semibold text-foreground">
                    {cmd.id}
                  </span>
                  {cmd.variables && Object.keys(cmd.variables).length > 0 && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {Object.entries(cmd.variables)
                        .map(([k, v]) => `${k}: ${v ?? ""}`)
                        .join(", ")}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    &ldquo;{cmd.rawTranscriptText}&rdquo;
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatTime(cmd.startMs / 1000)}–
                    {formatTime(cmd.endMs / 1000)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {wordLevel
            ? "Word-level highlighting enabled via wordLevel.enabled: true"
            : "Phrase-level highlighting (wordLevel disabled) — toggle on for word-level precision"}
        </p>
        {rawResponse && transcriptId && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowJson(true)}
            >
              View JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadTranscriptJson(transcriptId, rawResponse)}
            >
              <Download className="h-3.5 w-3.5" /> Download JSON
            </Button>
          </div>
        )}
      </div>

      <Dialog open={showJson} onOpenChange={setShowJson}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Transcript JSON</DialogTitle>
            <DialogDescription>
              Full response payload from{" "}
              <code>
                GET /interactions/{"{id}"}/transcripts/{"{transcriptId}"}
              </code>
              .
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[65vh] rounded-md border border-border bg-muted/20">
            <pre className="whitespace-pre-wrap p-4 text-xs text-foreground">
              {rawResponse
                ? JSON.stringify(rawResponse, null, 2)
                : "No transcript JSON loaded."}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

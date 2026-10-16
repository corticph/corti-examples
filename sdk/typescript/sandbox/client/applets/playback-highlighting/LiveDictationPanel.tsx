/**
 * Live dictation panel for the playback-highlighting applet.
 *
 * Mounts the CortiDictationComponent with a configuration wrench dialog
 * (commands, replacements, dictionary terms). Formatting is controlled at
 * the page level (shared between file and live tabs).
 *
 * Captures audio in parallel via useParallelArchive so that after recording
 * stops, the SyncedTranscriptPlayer replays the audio with synced
 * highlighting — the same player used in file processing mode.
 *
 * Live `/transcribe` timestamps are in seconds; the sync player and
 * usePlaybackSync expect milliseconds. The useLiveTranscript hook converts
 * on intake so the player works unchanged.
 *
 * During recording, a read-only transcript text area shows final segments as
 * they arrive. After recording stops, the full SyncedTranscriptPlayer with
 * audio controls replaces the read-only view.
 */

import type { Corti } from "@corti/sdk";
import { Loader2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { CortiDictationComponent } from "../_shared/cortiDictationReact";
import { buildFormattingOverrides } from "../_shared/formatting";
import type { FormattingConfig } from "../_shared/types";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useDictationLanguage } from "../_shared/useDictationLanguage";
import { toTranscribeCommands } from "../dictation-commands/commandModel";
import {
  setIdentity as setCommandIdentity,
  useCommandStore,
} from "../dictation-commands/commandStore";
import {
  type ArchiveSourceElement,
  useParallelArchive,
} from "../dictation-suite/useParallelArchive";
import { termStore } from "../dictionary-terms/terms";
import { replacementStore } from "../text-replacements/replacements";
import { concatAudioBlobsToWavUrl } from "./concatAudio";
import { LiveDictationConfig } from "./LiveDictationConfig";
import type { TranscriptSegment } from "./pipeline";
import { SyncedTranscriptPlayer } from "./SyncedTranscriptPlayer";
import { useLiveTranscript } from "./useLiveTranscript";

const ARCHIVE_NAMESPACE = "playback-highlighting-live";

function buildLiveConfig(
  primaryLanguage: string,
  opts: {
    wordLevel: boolean;
    automaticPunctuation?: boolean;
    spokenPunctuation?: boolean;
    commands: Corti.TranscribeCommand[];
    replacements: { find: string; replace: string }[];
    terms: { term: string }[];
    formatting?: FormattingConfig;
  },
): Corti.TranscribeConfig {
  const {
    wordLevel,
    automaticPunctuation,
    spokenPunctuation,
    commands,
    replacements,
    terms,
    formatting,
  } = opts;

  const keyterms = terms.length > 0 ? { terms } : undefined;
  const formattingOverrides = formatting ? buildFormattingOverrides(formatting) : undefined;

  return {
    primaryLanguage,
    interimResults: true,
    spokenPunctuation: spokenPunctuation ?? true,
    audioEvents: { enabled: true },
    commands,
    ...(formattingOverrides ? { formatting: formattingOverrides } : {}),
    replacements: replacements.map(({ find, replace }) => ({ find, replace })),
    terms,
    keyterms,
    wordLevel: { enabled: wordLevel },
    ...(automaticPunctuation !== undefined ? { automaticPunctuation } : {}),
  } as unknown as Corti.TranscribeConfig;
}

export interface LiveDictationPanelProps {
  wordLevel: boolean;
  automaticPunctuation?: boolean;
  spokenPunctuation?: boolean;
  formatting: FormattingConfig;
}

export function LiveDictationPanel({
  wordLevel,
  automaticPunctuation,
  spokenPunctuation,
  formatting,
}: LiveDictationPanelProps) {
  const { authConfig, clientId, tenantName, isReady } = useCortiAccessToken();
  const { language, onLanguagesChanged } = useDictationLanguage();
  const { commands: managedCommands } = useCommandStore();
  const replacements = replacementStore.useItems();
  const terms = termStore.useItems();

  const [tokenSeen, setTokenSeen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dictationEl, setDictationEl] = useState<ArchiveSourceElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isReady) {
      setTokenSeen(true);
    }
  }, [isReady]);

  useEffect(() => {
    setCommandIdentity(clientId, tenantName);
    replacementStore.setIdentity(clientId, tenantName);
    termStore.setIdentity(clientId, tenantName);
  }, [clientId, tenantName]);

  const dictationConfig = useMemo(
    () =>
      buildLiveConfig(language, {
        wordLevel,
        automaticPunctuation,
        spokenPunctuation,
        commands: toTranscribeCommands(managedCommands),
        replacements: replacements.map(({ find, replace }) => ({
          find,
          replace,
        })),
        terms: terms.map(({ term }) => ({ term })),
        formatting,
      }),
    [
      language,
      wordLevel,
      automaticPunctuation,
      spokenPunctuation,
      managedCommands,
      replacements,
      terms,
      formatting,
    ],
  );

  const archive = useParallelArchive(dictationEl, ARCHIVE_NAMESPACE, true);

  // Cumulative actual audio duration of all finalized archives — used to
  // offset timestamps for subsequent recordings so they align with the
  // concatenated WAV timeline.
  const priorAudioDurationMs = useMemo(
    () => archive.archives.reduce((sum, a) => sum + a.durationMs, 0),
    [archive.archives],
  );

  const {
    segments,
    commands,
    interim,
    isRecording,
    hasRecording,
    reset,
    handleTranscript,
    handleCommand,
    handleRecordingStateChanged,
  } = useLiveTranscript(priorAudioDurationMs);

  // Clear any archives from a prior session on mount.
  useEffect(() => {
    archive.clearArchives();
  }, []);

  // Concatenate all archive blobs (oldest first) into a single WAV URL.
  // WAV has accurate currentTime/duration — WebM concatenation produces
  // unreliable timelines (Infinity duration, jumping currentTime).
  const audioUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasRecording || archive.archives.length === 0) {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      setAudioUrl(null);
      return;
    }

    const blobs = archive.archives
      .slice()
      .reverse()
      .filter((a) => a.blob.size > 0)
      .map((a) => a.blob);

    if (blobs.length === 0) {
      return;
    }

    let cancelled = false;
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    concatAudioBlobsToWavUrl(blobs)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        audioUrlRef.current = url;
        setAudioUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setAudioUrl(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hasRecording, archive.archives]);

  // Auto-scroll interim preview to bottom as text arrives during recording.
  useEffect(() => {
    if (isRecording && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [interim, isRecording]);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  const handleReset = () => {
    reset();
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);
    archive.clearArchives();
  };

  const hasSegments = segments.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <span>
            <span className="font-semibold">Error: </span>
            {error}
          </span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-xs hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        {tokenSeen ? (
          <CortiDictationComponent
            ref={setDictationEl}
            authConfig={authConfig}
            dictationConfig={dictationConfig}
            settingsEnabled={["device", "language", "keybinding"]}
            onTranscript={handleTranscript}
            onCommand={handleCommand}
            onRecordingStateChanged={handleRecordingStateChanged}
            onLanguagesChanged={onLanguagesChanged}
            onError={(e: CustomEvent) => setError(e.detail?.message ?? "Unknown error")}
          />
        ) : (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for authentication…
          </span>
        )}
        <LiveDictationConfig />
      </div>

      {/* Interim preview */}
      <div
        ref={scrollRef}
        className={cn(
          "max-h-32 overflow-y-auto rounded-md border p-3 text-sm transition-colors",
          isRecording ? "border-lime-600/50" : "border-border",
        )}
      >
        {isRecording && interim ? (
          <span className="italic text-muted-foreground">{interim}</span>
        ) : (
          <span className="text-muted-foreground/50">
            {isRecording ? "Listening…" : "Interim results appear here while recording."}
          </span>
        )}
      </div>

      {/* Player — always visible once we have segments or a recording */}
      {(hasSegments || hasRecording) && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                isRecording
                  ? "border-lime-600/50 bg-lime-600/10 text-muted-foreground"
                  : "border-variant-success-border bg-variant-success-bg text-variant-success-text",
              )}
            >
              {isRecording
                ? "Recording…"
                : `${wordLevel ? "Words" : "Phrases"}: ${segments.length}`}
            </span>
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Clear all
            </Button>
          </div>

          <SyncedTranscriptPlayer
            segments={segments as TranscriptSegment[]}
            audioUrl={audioUrl}
            diarize={false}
            wordLevel={wordLevel}
            primaryLanguage={language}
            disabled={isRecording}
            commands={commands}
          />
        </div>
      )}
    </div>
  );
}

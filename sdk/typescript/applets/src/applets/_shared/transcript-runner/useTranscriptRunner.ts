/**
 * Owns the full offline `/transcripts` runner: source/parameter inputs, the
 * interaction + recording pickers (with lazy loading and refresh), and the
 * upload → create → poll → fetch pipeline. Stateless about *what* happens after
 * the transcript is fetched — pass `secondPass` to `generate()` to run extra
 * work (e.g. an agent pass) while the runner manages the `second_pass` phase
 * and keeps the finalized transcript visible if that work throws.
 */
import { useEffect, useState } from "react";
import {
  createEmptyRunState,
  flattenTranscriptForDisplay,
  resetRunStateForNewRun,
  type InteractionSummary,
  type TranscriptCreateRequest,
  type TranscriptProcessingStatus,
  type TranscriptResponse,
  type TranscriptRunState,
  type TranscriptSourceMode,
  type UploadInteractionMode,
} from "./model";
import {
  createExamplesInteraction,
  createTranscript,
  getTranscript,
  listInteractions,
  listRecordings,
  pollTranscriptUntilReady,
  uploadRecording,
} from "./transcripts-api";

function buildTranscriptRequest(
  recordingId: string,
  primaryLanguage: string,
  isDictation: boolean,
  isMultichannel: boolean,
  diarize: boolean,
): TranscriptCreateRequest {
  return {
    recordingId,
    primaryLanguage: primaryLanguage.trim(),
    isDictation,
    isMultichannel,
    diarize,
    async: true,
  };
}

export interface GenerateOptions {
  /**
   * Runs after the transcript is fetched and the display state is set, with the
   * runner in the `second_pass` phase. If it throws, the finalized transcript
   * stays visible and the runner moves to `error`.
   */
  secondPass?: (transcript: TranscriptResponse) => Promise<void>;
  /** Called when a rerun begins, before any network work. */
  onRunStart?: () => void;
}

export interface TranscriptRunner {
  // source + parameter inputs
  sourceMode: TranscriptSourceMode;
  setSourceMode: (mode: TranscriptSourceMode) => void;
  uploadInteractionMode: UploadInteractionMode;
  setUploadInteractionMode: (mode: UploadInteractionMode) => void;
  primaryLanguage: string;
  setPrimaryLanguage: (value: string) => void;
  isDictation: boolean;
  setIsDictation: (value: boolean) => void;
  isMultichannel: boolean;
  setIsMultichannel: (value: boolean) => void;
  diarize: boolean;
  setDiarize: (value: boolean) => void;
  file: File | null;
  setFile: (file: File | null) => void;

  // interaction + recording pickers
  interactions: InteractionSummary[];
  selectedInteractionId: string;
  setSelectedInteractionId: (id: string) => void;
  recordings: string[];
  selectedRecordingId: string;
  setSelectedRecordingId: (id: string) => void;
  isRefreshingInteractions: boolean;
  isRefreshingRecordings: boolean;
  refreshInteractions: () => Promise<void>;
  refreshRecordings: () => Promise<void>;

  // run state + actions
  runState: TranscriptRunState;
  browserError?: string;
  busy: boolean;
  inputsInvalid: boolean;
  selectedInteraction?: InteractionSummary;
  generate: (options?: GenerateOptions) => Promise<void>;
}

export function useTranscriptRunner(): TranscriptRunner {
  const [sourceMode, setSourceMode] = useState<TranscriptSourceMode>("upload");
  const [uploadInteractionMode, setUploadInteractionMode] =
    useState<UploadInteractionMode>("new");
  const [primaryLanguage, setPrimaryLanguage] = useState("en");
  const [isDictation, setIsDictation] = useState(true);
  const [isMultichannel, setIsMultichannel] = useState(false);
  const [diarize, setDiarize] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [interactions, setInteractions] = useState<InteractionSummary[]>([]);
  const [selectedInteractionId, setSelectedInteractionId] = useState("");
  const [recordings, setRecordings] = useState<string[]>([]);
  const [selectedRecordingId, setSelectedRecordingId] = useState("");

  const [runState, setRunState] = useState<TranscriptRunState>(
    createEmptyRunState(),
  );
  const [browserError, setBrowserError] = useState<string>();
  const [isRefreshingInteractions, setIsRefreshingInteractions] =
    useState(false);
  const [isRefreshingRecordings, setIsRefreshingRecordings] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setRunState((current) =>
        current.phase === "idle"
          ? { ...current, phase: "loading_interactions" }
          : current,
      );
      setBrowserError(undefined);
      setIsRefreshingInteractions(true);
      try {
        const items = await listInteractions();
        if (cancelled) return;
        setInteractions(items);
        setSelectedInteractionId((current) => {
          if (current && items.some((item) => item.id === current)) {
            return current;
          }
          return items[0]?.id || "";
        });
        setRunState((current) =>
          current.phase === "loading_interactions"
            ? { ...current, phase: "idle" }
            : current,
        );
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load interactions.";
        setBrowserError(message);
        setRunState((current) =>
          current.phase === "loading_interactions"
            ? { ...current, phase: "error", error: message }
            : current,
        );
      } finally {
        if (!cancelled) {
          setIsRefreshingInteractions(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sourceMode !== "recording" || !selectedInteractionId) {
      setRecordings([]);
      setSelectedRecordingId("");
      return;
    }

    let cancelled = false;

    async function load() {
      setIsRefreshingRecordings(true);
      setBrowserError(undefined);
      setRunState((current) =>
        current.phase === "idle"
          ? { ...current, phase: "loading_recordings" }
          : current,
      );
      try {
        const items = await listRecordings(selectedInteractionId);
        if (cancelled) return;
        setRecordings(items);
        setSelectedRecordingId((current) => {
          if (current && items.includes(current)) {
            return current;
          }
          return items[0] || "";
        });
        setRunState((current) =>
          current.phase === "loading_recordings"
            ? { ...current, phase: "idle" }
            : current,
        );
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Failed to load recordings.";
        setBrowserError(message);
        setRunState((current) =>
          current.phase === "loading_recordings"
            ? { ...current, phase: "error", error: message }
            : current,
        );
      } finally {
        if (!cancelled) {
          setIsRefreshingRecordings(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sourceMode, selectedInteractionId]);

  async function refreshInteractions() {
    setIsRefreshingInteractions(true);
    setBrowserError(undefined);
    try {
      const items = await listInteractions();
      setInteractions(items);
      setSelectedInteractionId((current) => {
        if (current && items.some((item) => item.id === current)) {
          return current;
        }
        return items[0]?.id || "";
      });
    } catch (error) {
      setBrowserError(
        error instanceof Error ? error.message : "Failed to load interactions.",
      );
    } finally {
      setIsRefreshingInteractions(false);
    }
  }

  async function refreshRecordings() {
    if (!selectedInteractionId) return;
    setIsRefreshingRecordings(true);
    setBrowserError(undefined);
    try {
      const items = await listRecordings(selectedInteractionId);
      setRecordings(items);
      setSelectedRecordingId((current) => {
        if (current && items.includes(current)) {
          return current;
        }
        return items[0] || "";
      });
    } catch (error) {
      setBrowserError(
        error instanceof Error ? error.message : "Failed to load recordings.",
      );
    } finally {
      setIsRefreshingRecordings(false);
    }
  }

  function validate(): string | null {
    if (!primaryLanguage.trim()) {
      return "Primary language is required.";
    }
    if (sourceMode === "upload" && !file) {
      return "Choose an audio file first.";
    }
    if (
      sourceMode === "upload" &&
      uploadInteractionMode === "existing" &&
      !selectedInteractionId
    ) {
      return "Choose an interaction before uploading.";
    }
    if (
      sourceMode === "recording" &&
      (!selectedInteractionId || !selectedRecordingId)
    ) {
      return "Choose an interaction and recording first.";
    }
    return null;
  }

  async function generate(options?: GenerateOptions) {
    const validationError = validate();
    if (validationError) {
      setRunState({
        ...createEmptyRunState(),
        phase: "error",
        error: validationError,
      });
      return;
    }

    setBrowserError(undefined);
    options?.onRunStart?.();

    let interactionId = "";
    let recordingId = "";
    let transcriptId = "";

    try {
      setRunState(
        resetRunStateForNewRun(
          sourceMode === "upload" ? "uploading" : "creating_transcript",
        ),
      );

      if (sourceMode === "upload") {
        interactionId =
          uploadInteractionMode === "new"
            ? await createExamplesInteraction()
            : selectedInteractionId;
        recordingId = await uploadRecording(interactionId, file!);
        setRunState((current) => ({
          ...current,
          interactionId,
          recordingId,
          phase: "creating_transcript",
        }));
      } else {
        interactionId = selectedInteractionId;
        recordingId = selectedRecordingId;
        setRunState((current) => ({
          ...current,
          interactionId,
          recordingId,
          phase: "creating_transcript",
        }));
      }

      const created = await createTranscript(
        interactionId,
        buildTranscriptRequest(
          recordingId,
          primaryLanguage.trim(),
          isDictation,
          isMultichannel,
          diarize,
        ),
      );
      transcriptId = created.transcriptId;

      setRunState((current) => ({
        ...current,
        transcriptId,
        transcriptStatus: created.status,
        phase: "polling",
      }));

      const status = await pollTranscriptUntilReady(
        interactionId,
        transcriptId,
        {
          onStatus: (nextStatus: TranscriptProcessingStatus) => {
            setRunState((current) => ({
              ...current,
              transcriptStatus: nextStatus,
            }));
          },
        },
      );

      if (status === "failed") {
        setRunState((current) => ({
          ...current,
          phase: "error",
          transcriptStatus: status,
          error: "Transcript processing failed.",
        }));
        return;
      }

      const transcript = await getTranscript(interactionId, transcriptId);

      setRunState((current) => ({
        ...current,
        transcriptJson: transcript,
        transcriptText: flattenTranscriptForDisplay(transcript),
        transcriptStatus: transcript.status,
        phase: options?.secondPass ? "second_pass" : "done",
        error: undefined,
      }));

      if (options?.secondPass) {
        await options.secondPass(transcript);
        setRunState((current) => ({ ...current, phase: "done" }));
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Transcript run failed.";
      // Functional update preserves any transcript already fetched — a failed
      // second pass leaves the finalized transcript on screen.
      setRunState((current) => ({
        ...current,
        interactionId: current.interactionId || interactionId || null,
        recordingId: current.recordingId || recordingId || null,
        transcriptId: current.transcriptId || transcriptId || null,
        phase: "error",
        error: message,
      }));
    }
  }

  const busy =
    runState.phase !== "idle" &&
    runState.phase !== "done" &&
    runState.phase !== "error";

  const inputsInvalid = validate() !== null;

  const selectedInteraction = interactions.find(
    (item) => item.id === selectedInteractionId,
  );

  return {
    sourceMode,
    setSourceMode,
    uploadInteractionMode,
    setUploadInteractionMode,
    primaryLanguage,
    setPrimaryLanguage,
    isDictation,
    setIsDictation,
    isMultichannel,
    setIsMultichannel,
    diarize,
    setDiarize,
    file,
    setFile,
    interactions,
    selectedInteractionId,
    setSelectedInteractionId,
    recordings,
    selectedRecordingId,
    setSelectedRecordingId,
    isRefreshingInteractions,
    isRefreshingRecordings,
    refreshInteractions,
    refreshRecordings,
    runState,
    browserError,
    busy,
    inputsInvalid,
    selectedInteraction,
    generate,
  };
}

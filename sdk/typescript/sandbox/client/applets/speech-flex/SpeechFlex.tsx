/**
 * Applet — CONCEPT: dual-mode clinical workspace (Speech Flex).
 *
 * Clinicians flex between two capture modes against the same patient
 * interaction:
 *
 *   - **Dictation** — self-entry via `/transcribe` (`<corti-dictation>`)
 *   - **Ambient** — conversational audio capture via `/streams`
 *     (`<corti-ambient>`) with diarized transcription and optional facts
 *
 * A visit schedule (Corti interactions sorted by scheduled date) anchors
 * both modes to the same patient encounter. A toggle switch below the
 * mic control switches the recording and recognition behavior while
 * keeping the visit context constant.
 *
 * The editor (DictationPanel) is collapsible — it is the "EHR" surface.
 * Mode toggling changes only the mic control in the header; the editor,
 * collapsible transcript/facts panels, and note generation card stay put.
 *
 * All interaction-scoped data (transcripts, facts, existing notes) is
 * fetched in a single effect when a visit is selected, using the validated
 * `client` (gated by `isReady`). Child components receive data as props —
 * they never create their own clients or manage fetch lifecycles.
 *
 * Phase 1–6: skeleton + mode switching + visit schedule + dictation editor
 * with per-interaction draft persistence + ambient recording with clip
 * tracking, live diarized transcript, optional facts + note generation
 * with multiple notes per visit + config dialog (commands, replacements,
 * dictionary, cleanup prompt, ambient settings) + dictation cleanup agent.
 * Phase 7: UX refactor — editor always visible, collapsible ambient
 * panels, combined context for note generation.
 * Phase 8: paste-transcript mode, preserve-dictated-text verbatim toggle
 * (client-side prepend), combined-no-facts source, collapsible
 * dictation editor.
 */

import type { Corti } from "@corti/sdk";
import { CortiClient } from "@corti/sdk";
import { Loader2, Mic, Pencil, Radio, Save, Stethoscope, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { CortiAmbientComponent } from "../_shared/cortiAmbientReact";
import { CortiDictationComponent } from "../_shared/cortiDictationReact";
import { type DiarizedSegment, mergeDiarizedSegments } from "../_shared/diarizedTranscript";
import { EXAMPLES_ANALYTICS } from "../_shared/examplesAnalytics";
import { buildFormattingOverrides } from "../_shared/formatting";
import { useSessionState } from "../_shared/sessionState";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useDictationLanguage } from "../_shared/useDictationLanguage";
import { cn } from "../_shared/utils";
import { toTranscribeCommands } from "../dictation-commands/commandModel";
import {
  clearLog,
  setIdentity as setCommandIdentity,
  useCommandStore,
} from "../dictation-commands/commandStore";
import { buildSuiteConfig } from "../dictation-suite/suiteConfig";
import { termStore } from "../dictionary-terms/terms";
import { setPromptIdentity } from "../on-demand-agent/prompts";
import { replacementStore } from "../text-replacements/replacements";
import {
  type AmbientClip,
  CollapsibleSection,
  FactsPanel,
  RecordingStatusBar,
  TranscriptPanel,
  type TranscriptPanelMode,
  useAmbientHandlers,
} from "./AmbientPanel";
import { DictationPanel } from "./DictationPanel";
import { type ExistingNote, NoteGeneration } from "./NoteGeneration";
import { parsePastedTranscript } from "./pastedTranscript";
import { loadSettings, SpeechFlexConfig, type SpeechFlexSettings } from "./SpeechFlexConfig";
import { useInteractions } from "./useInteractions";
import { VisitSchedule } from "./VisitSchedule";
import type { WorkspaceMode } from "./workspaceState";

/**
 * Green text/border that works on both light and dark backgrounds.
 * `corti-lime` alone is nearly invisible on white (hsl 77 94% 53%), so
 * light mode uses Tailwind's built-in `lime-600` and dark mode keeps the
 * brand variable. Same pattern as Languages.tsx and MockApp.tsx.
 */
const greenText = "text-lime-600 dark:text-corti-lime";

const ENCOUNTER_TYPE_LABELS: Record<string, string> = {
  first_consultation: "First consult",
  consultation: "Consultation",
  emergency: "Emergency",
  inpatient: "Inpatient",
  outpatient: "Outpatient",
};

/** A disabled mic control shown in ambient mode when no visit is selected. */
function DisabledMicControl({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 opacity-60">
      <Mic className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{message}</span>
    </div>
  );
}

export function SpeechFlex() {
  const { authConfig, clientId, sdkEnvironment, isReady, tenantName } = useCortiAccessToken();
  const { language, onLanguagesChanged } = useDictationLanguage();
  const [mode, setMode] = useSessionState<WorkspaceMode>("mode", "dictation");
  const [creatingVisit, setCreatingVisit] = useState(false);
  const [dictationText, setDictationText] = useState("");
  const [settings, setSettings] = useState<SpeechFlexSettings>(loadSettings);

  // Interaction-scoped data — all fetched in a single effect when a visit
  // is selected. Owned here so it survives mode toggles. Cleared when the
  // interaction changes.
  const [ambientSegments, setAmbientSegments] = useState<DiarizedSegment[]>([]);
  const [ambientFacts, setAmbientFacts] = useState<Corti.StreamFact[]>([]);
  const [ambientClips, setAmbientClips] = useState<AmbientClip[]>([]);
  const [ambientRecording, setAmbientRecording] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [transcriptPanelMode, setTranscriptPanelMode] = useState<TranscriptPanelMode>("ambient");
  const [existingNotes, setExistingNotes] = useState<ExistingNote[]>([]);
  const [interactionLoading, setInteractionLoading] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  // Document IDs per interaction, persisted in localStorage so generated
  // notes survive page refresh. Keyed by `${clientId}:${tenant}:${interactionId}`.
  const docStoreKey = "speech-flex.docIds";
  const getDocIds = useCallback(
    (interactionId: string) => {
      try {
        const raw = localStorage.getItem(docStoreKey);
        const map = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
        return map[`${clientId}:${tenantName}:${interactionId}`] ?? [];
      } catch {
        return [];
      }
    },
    [clientId, tenantName],
  );
  const addDocId = useCallback(
    (interactionId: string, docId: string) => {
      try {
        const raw = localStorage.getItem(docStoreKey);
        const map = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
        const key = `${clientId}:${tenantName}:${interactionId}`;
        const ids = map[key] ?? [];
        if (!ids.includes(docId)) {
          ids.push(docId);
          map[key] = ids;
          localStorage.setItem(docStoreKey, JSON.stringify(map));
        }
      } catch {
        // ignore
      }
    },
    [clientId, tenantName],
  );

  // Store subscriptions for dictation config.
  const { commands, log } = useCommandStore();
  const replacements = replacementStore.useItems();
  const terms = termStore.useItems();

  // Point stores at this tenant/client.
  useEffect(() => {
    setCommandIdentity(clientId, tenantName);
    replacementStore.setIdentity(clientId, tenantName);
    termStore.setIdentity(clientId, tenantName);
    setPromptIdentity(clientId, tenantName, "speech-flex");
  }, [clientId, tenantName]);

  // Ref bridge: the dictation web component lives in the header, the
  // DictationPanel lives below. The ref forwards transcript events.
  const dictationTranscriptRef = useRef<((e: CustomEvent) => void) | null>(null);
  const commandHandlerRef = useRef<((e: CustomEvent) => void) | null>(null);

  // Ambient event handlers — returns callbacks for the ambient web component.
  const {
    handleTranscript: handleAmbientTranscript,
    handleFacts: handleAmbientFacts,
    handleRecordingState: handleAmbientRecordingState,
  } = useAmbientHandlers({
    setSegments: setAmbientSegments,
    setFacts: setAmbientFacts,
    clips: ambientClips,
    setClips: setAmbientClips,
    setIsRecording: setAmbientRecording,
  });

  const client = useMemo(() => {
    if (!isReady) {
      return null;
    }
    return new CortiClient({
      environment: sdkEnvironment,
      auth: authConfig,
      analytics: EXAMPLES_ANALYTICS,
    });
  }, [sdkEnvironment, authConfig, isReady]);

  const { visits, loading, error, selectedVisitId, selectVisit, createVisit, updateVisit } =
    useInteractions(client);

  const selectedVisit = visits.find((v) => v.interactionId === selectedVisitId);

  // Pasted transcript → segments. Owned here so it survives the panel mode
  // toggle and clears on visit change. Feeds note generation when the panel
  // is in "paste" mode (see effectiveSegments below).
  //
  // Debounced: parsing on every keystroke causes lag with large pastes, and
  // the parsed segments aren't rendered while typing (paste mode shows a
  // textarea, not the speaker-run preview). 1500ms gives the user time to
  // finish a paste or type a line before the parse runs.
  const [debouncedPastedText, setDebouncedPastedText] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPastedText(pastedText), 1500);
    return () => clearTimeout(timer);
  }, [pastedText]);
  const pastedSegments = useMemo(
    () => parsePastedTranscript(debouncedPastedText),
    [debouncedPastedText],
  );
  const effectiveSegments = transcriptPanelMode === "paste" ? pastedSegments : ambientSegments;

  // Inline edit state for the patient context bar
  const [editingVisit, setEditingVisit] = useState(false);
  const [editForm, setEditForm] = useState<{
    patientName: string;
    patientIdentifier: string;
    encounterType: string;
    encounterStatus: string;
    scheduledAt: string;
  }>({
    patientName: "",
    patientIdentifier: "",
    encounterType: "outpatient",
    encounterStatus: "planned",
    scheduledAt: "",
  });
  const [savingVisit, setSavingVisit] = useState(false);

  const startEditing = () => {
    if (!selectedVisit) {
      return;
    }
    setEditForm({
      patientName: selectedVisit.patient?.name ?? "",
      patientIdentifier: selectedVisit.patient?.identifier ?? "",
      encounterType: selectedVisit.encounter.type ?? "outpatient",
      encounterStatus: selectedVisit.encounter.status ?? "planned",
      scheduledAt: selectedVisit.encounter.period.startedAt
        ? new Date(selectedVisit.encounter.period.startedAt).toISOString().slice(0, 16)
        : "",
    });
    setEditingVisit(true);
  };

  const handleSaveVisit = async () => {
    if (!selectedVisitId) {
      return;
    }
    setSavingVisit(true);
    try {
      await updateVisit({
        interactionId: selectedVisitId,
        patientName: editForm.patientName,
        patientIdentifier: editForm.patientIdentifier,
        encounterType: editForm.encounterType,
        encounterStatus: editForm.encounterStatus,
        scheduledAt: editForm.scheduledAt ? new Date(editForm.scheduledAt) : undefined,
      });
      setEditingVisit(false);
    } catch (e) {
      console.error("Failed to update visit:", e);
    } finally {
      setSavingVisit(false);
    }
  };

  const handleNoteGenerated = useCallback(
    (docId: string) => {
      if (selectedVisitId) {
        addDocId(selectedVisitId, docId);
      }
    },
    [selectedVisitId, addDocId],
  );

  // Clear interaction-scoped state when the visit changes.
  useEffect(() => {
    if (fetchedRef.current !== selectedVisitId) {
      fetchedRef.current = null;
      setAmbientSegments([]);
      setAmbientFacts([]);
      setAmbientClips([]);
      setAmbientRecording(false);
      setPastedText("");
      setTranscriptPanelMode("ambient");
      setExistingNotes([]);
    }
  }, [selectedVisitId]);

  // Fetch all interaction-scoped data (transcripts, facts, existing notes)
  // in a single pass when a visit is selected. Uses the validated `client`
  // so it only fires when auth is ready. Tracked by `fetchedRef` so it runs
  // once per interaction.
  useEffect(() => {
    if (!client || !selectedVisitId) {
      return;
    }
    if (fetchedRef.current === selectedVisitId) {
      return;
    }
    fetchedRef.current = selectedVisitId;
    setInteractionLoading(true);

    void (async () => {
      try {
        // Fetch transcripts (full: true returns segment data, not just the sample).
        const transcriptList = await client.transcripts.list(selectedVisitId, {
          full: true,
        });
        const transcripts = transcriptList.transcripts ?? [];
        const allSegments: DiarizedSegment[] = [];
        for (const item of transcripts) {
          if (item.transcript?.transcripts) {
            for (const seg of item.transcript.transcripts) {
              allSegments.push({
                id: item.id,
                transcript: seg.text,
                final: true,
                speakerId: seg.speakerId,
                participant: { channel: seg.channel },
                time: { start: seg.start, end: seg.end },
              });
            }
          }
        }
        if (allSegments.length > 0) {
          setAmbientSegments((prev) =>
            prev.length === 0 ? allSegments : mergeDiarizedSegments(prev, allSegments),
          );
        }

        // Fetch facts.
        if (settings.factsEnabled) {
          const factsResponse = await client.facts.list(selectedVisitId);
          const fetchedFacts = (factsResponse.facts ?? []).map((f) => ({
            id: f.id ?? "",
            text: f.text ?? "",
            group: f.group ?? "other",
            groupId: f.groupId ?? "",
            isDiscarded: f.isDiscarded ?? false,
            source: f.source ?? "core",
            createdAt: f.createdAt ?? new Date(),
            updatedAt: f.updatedAt,
          })) as Corti.StreamFact[];
          if (fetchedFacts.length > 0) {
            setAmbientFacts(fetchedFacts);
          }
        }

        // Fetch existing notes by document ID. Documents generated via
        // client.documents.generate() with explicit context are NOT linked to
        // the interaction (context and interactionId are mutually exclusive),
        // so listing by interactionId returns nothing. Instead, we persist
        // document IDs per interaction in localStorage and fetch each via
        // client.documents.get().
        const docIds = getDocIds(selectedVisitId);
        if (docIds.length > 0 && client) {
          const notes: ExistingNote[] = [];
          for (const docId of docIds) {
            try {
              const doc = await client.documents.get(docId);
              notes.push({
                id: doc.id,
                templateName: doc.name,
                createdAt: doc.createdAt.getTime(),
                orderedSections:
                  doc.sections && doc.stringDocument
                    ? doc.sections
                        .map(
                          (s) =>
                            [s.heading, doc.stringDocument[s.sectionId] ?? ""] as [string, string],
                        )
                        .filter(([, content]) => content.length > 0)
                    : [],
                creditsConsumed: 0,
              });
            } catch {
              // Document may have been deleted or expired — skip it.
            }
          }
          if (notes.length > 0) {
            setExistingNotes(notes);
          }
        }
      } catch {
        // Non-fatal — the user can still record and generate new notes.
      } finally {
        setInteractionLoading(false);
      }
    })();
  }, [client, selectedVisitId, settings.factsEnabled]);

  const handleCreateVisit = async (params: {
    patientIdentifier: string;
    patientName: string;
    scheduledAt: Date;
  }) => {
    setCreatingVisit(true);
    try {
      await createVisit(params);
    } finally {
      setCreatingVisit(false);
    }
  };

  // Token gate — same pattern as DictationSuite.
  const [tokenSeen, setTokenSeen] = useState(false);
  if (isReady && !tokenSeen) {
    setTokenSeen(true);
  }

  // Forward transcript events from the dictation web component to DictationPanel.
  const handleDictationTranscript = useCallback((e: CustomEvent) => {
    dictationTranscriptRef.current?.(e);
  }, []);

  // Build dictation config from stores (same as Dictation Suite).
  const dictationConfig = useMemo(
    () =>
      buildSuiteConfig(language, {
        replacements,
        terms,
        commands: toTranscribeCommands(commands),
        formatting: settings.formatting,
      }),
    [language, replacements, terms, commands, settings.formatting],
  );

  const ambientFormatting = useMemo(
    () => buildFormattingOverrides(settings.formatting),
    [settings.formatting],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header: mic control + config + visit indicator with clear button */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        {/* Web component — always visible, disabled in ambient mode without a visit */}
        <div className="flex items-center gap-2">
          {tokenSeen && mode === "dictation" ? (
            <CortiDictationComponent
              key="dictation"
              authConfig={authConfig}
              dictationConfig={dictationConfig}
              settingsEnabled={["device", "language", "keybinding"]}
              onTranscript={handleDictationTranscript}
              onCommand={(e) => commandHandlerRef.current?.(e)}
              onLanguagesChanged={onLanguagesChanged}
            />
          ) : tokenSeen && mode === "ambient" && selectedVisitId ? (
            <CortiAmbientComponent
              key="ambient"
              authConfig={authConfig}
              interactionId={selectedVisitId}
              ambientConfig={
                {
                  transcription: {
                    primaryLanguage: language,
                    isDiarization: true,
                    isMultichannel: false,
                    participants: [],
                  },
                  mode: settings.factsEnabled
                    ? { type: "facts" as const, outputLocale: language }
                    : { type: "transcription" as const },
                  audioEvents: { enabled: true },
                  ...(ambientFormatting
                    ? {
                        formatting: {
                          dates: ambientFormatting.dates,
                          times: ambientFormatting.times,
                          numbers: ambientFormatting.numbers,
                          measurements: ambientFormatting.measurements,
                          numericRanges: ambientFormatting.numericRanges,
                          ordinals: ambientFormatting.ordinals,
                        },
                      }
                    : {}),
                } as Corti.StreamConfig
              }
              settingsEnabled={["device", "language"]}
              onTranscript={handleAmbientTranscript}
              onFacts={settings.factsEnabled ? handleAmbientFacts : undefined}
              onRecordingStateChanged={handleAmbientRecordingState}
              onLanguagesChanged={onLanguagesChanged}
            />
          ) : tokenSeen && mode === "ambient" && !selectedVisitId ? (
            <DisabledMicControl message="Select a visit to enable ambient recording" />
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Stethoscope className="h-4 w-4 animate-pulse" />
              Waiting for authentication…
            </span>
          )}
        </div>

        {/* Config wrench — right-aligned in header */}
        <div className="ml-auto">
          <SpeechFlexConfig settings={settings} onSettingsChange={setSettings} />
        </div>
      </header>

      {/* Mode toggle — below the mic control */}
      <div className="flex items-center gap-2">
        <Mic
          className={cn(
            "h-4 w-4 transition-colors",
            mode === "dictation" ? greenText : "text-muted-foreground",
          )}
        />
        <Switch
          checked={mode === "ambient"}
          onCheckedChange={(checked) => setMode(checked ? "ambient" : "dictation")}
          aria-label="Toggle between dictation and ambient mode"
        />
        <Radio
          className={cn(
            "h-4 w-4 transition-colors",
            mode === "ambient" ? greenText : "text-muted-foreground",
          )}
        />
        <span className="text-sm font-medium text-foreground">
          {mode === "dictation" ? "Dictation" : "Ambient"}
        </span>
      </div>

      {/* Main content area: visit schedule + always-visible editor + collapsibles + notes */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Left column: visit schedule */}
        <div className="w-full shrink-0 lg:w-80">
          <VisitSchedule
            visits={visits}
            loading={loading}
            error={error}
            selectedVisitId={selectedVisitId}
            onSelect={selectVisit}
            onCreate={handleCreateVisit}
            creating={creatingVisit}
          />
        </div>

        {/* Right column: context bar + editor + collapsible panels + note generation */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Patient context bar — spans the editor width */}
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
            <Stethoscope
              className={cn(
                "h-4 w-4 shrink-0",
                selectedVisit ? greenText : "text-muted-foreground",
              )}
            />
            {selectedVisit ? (
              editingVisit ? (
                /* Inline edit form */
                <div className="flex flex-1 flex-wrap items-end gap-3">
                  <div className="flex flex-1 flex-col gap-1 min-w-[120px]">
                    <label htmlFor="edit-patient-name" className="text-xs text-muted-foreground">
                      Patient name
                    </label>
                    <input
                      id="edit-patient-name"
                      type="text"
                      value={editForm.patientName}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          patientName: e.target.value,
                        }))
                      }
                      className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="flex flex-col gap-1 min-w-[80px]">
                    <label htmlFor="edit-mrn" className="text-xs text-muted-foreground">
                      MRN
                    </label>
                    <input
                      id="edit-mrn"
                      type="text"
                      value={editForm.patientIdentifier}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          patientIdentifier: e.target.value,
                        }))
                      }
                      className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="flex flex-col gap-1 min-w-[120px]">
                    <label htmlFor="edit-visit-type" className="text-xs text-muted-foreground">
                      Visit type
                    </label>
                    <select
                      id="edit-visit-type"
                      value={editForm.encounterType}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          encounterType: e.target.value,
                        }))
                      }
                      className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {Object.entries(ENCOUNTER_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 min-w-[120px]">
                    <label htmlFor="edit-visit-date" className="text-xs text-muted-foreground">
                      Visit date
                    </label>
                    <input
                      id="edit-visit-date"
                      type="datetime-local"
                      value={editForm.scheduledAt}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          scheduledAt: e.target.value,
                        }))
                      }
                      className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleSaveVisit()}
                      disabled={savingVisit}
                      className="inline-flex items-center gap-1 rounded border border-lime-600 bg-lime-600/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-lime-600/20 disabled:opacity-50 dark:border-corti-lime dark:bg-corti-lime/10 dark:hover:bg-corti-lime/20"
                    >
                      {savingVisit ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {savingVisit ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingVisit(false)}
                      className="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <>
                  <span className="text-sm font-medium text-foreground">
                    {selectedVisit.patient?.name ?? selectedVisit.encounter.title ?? "Unknown"}
                  </span>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="text-sm text-muted-foreground">
                    {ENCOUNTER_TYPE_LABELS[selectedVisit.encounter.type] ??
                      selectedVisit.encounter.type}
                  </span>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(selectedVisit.encounter.period.startedAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="font-mono text-xs text-muted-foreground/60">
                    MRN: {selectedVisit.patient?.identifier ?? "—"}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-muted-foreground/40">
                      {selectedVisit.interactionId}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEditing()}
                      title="Edit visit details"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => selectVisit(null)}
                      title="Clear patient context"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )
            ) : (
              <span className="text-sm text-muted-foreground">No visit selected</span>
            )}
          </div>

          {/* Dictation editor — collapsible, like the Transcript and Facts panels. */}
          <CollapsibleSection title="Dictation" defaultOpen>
            <DictationPanel
              interactionId={selectedVisitId}
              clientId={clientId}
              tenant={tenantName}
              language={language}
              transcriptHandlerRef={dictationTranscriptRef}
              commandHandlerRef={commandHandlerRef}
              onTextChange={setDictationText}
              authConfig={authConfig}
              sdkEnvironment={sdkEnvironment}
            />
          </CollapsibleSection>

          {/* Command monitor — detected commands + executed action */}
          {log.length > 0 && (
            <div className="rounded-md border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Command monitor
                </p>
                <button
                  type="button"
                  onClick={clearLog}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="h-3 w-3" /> Clear
                </button>
              </div>
              <ul className="max-h-48 divide-y divide-border overflow-auto">
                {log.map((entry) => (
                  <li
                    key={`${entry.at}-${entry.id}`}
                    className="flex items-baseline gap-2 px-3 py-1.5 text-xs"
                  >
                    <code className="shrink-0 font-semibold text-foreground">{entry.id}</code>
                    {entry.variables && Object.keys(entry.variables).length > 0 && (
                      <code className="shrink-0 text-muted-foreground">
                        {JSON.stringify(entry.variables)}
                      </code>
                    )}
                    <span className="truncate text-foreground">{entry.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recording status bar — ambient mode only, when a visit is selected */}
          {mode === "ambient" && selectedVisitId && (
            <RecordingStatusBar isRecording={ambientRecording} clips={ambientClips} />
          )}

          {/* Collapsible transcript + facts panels — visible when a visit is selected */}
          {selectedVisitId && (
            <>
              {interactionLoading && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading interaction data…</span>
                </div>
              )}
              <TranscriptPanel
                segments={effectiveSegments}
                mode={transcriptPanelMode}
                onModeChange={setTranscriptPanelMode}
                pastedText={pastedText}
                onPastedTextChange={setPastedText}
              />
              {settings.factsEnabled && (
                <FactsPanel facts={ambientFacts} setFacts={setAmbientFacts} />
              )}
            </>
          )}

          {/* Note generation — always available */}
          <NoteGeneration
            authConfig={authConfig}
            sdkEnvironment={sdkEnvironment}
            client={client}
            interactionId={selectedVisitId}
            text={dictationText}
            spokenLanguage={language}
            defaultTemplateKeywords={["soap"]}
            documentSource={settings.documentSource}
            getFacts={() => ambientFacts}
            getSegments={() => effectiveSegments}
            existingNotes={existingNotes}
            onNoteGenerated={handleNoteGenerated}
          />
        </div>
      </div>
    </div>
  );
}

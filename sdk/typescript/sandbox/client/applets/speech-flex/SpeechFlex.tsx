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
 * both modes to the same patient encounter. A toggle in the capture bar
 * switches the recording and recognition behavior while keeping the visit
 * context constant.
 *
 * Runs as a full-viewport clinical app on its own route
 * (`/:workflow/:applet/fullscreen`, via the registry's
 * `demoPlacement: "fullscreen"`), under the shared Navbar
 * rendered by AppletFullscreen. Layout per the Corti
 * clinical app design language:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Navbar: logo · Speech Flex · theme toggle · exit             │
 *   │ Capture bar: mic control · mode pills · status · config     │
 *   ├──────────┬──────────────────────────┬──────────────────────┤
 *   │ Left rail│ Main panel               │ Note generation      │
 *   │ 320px   │ dictation editor,        │ flex-1 — template,   │
 *   │ patient  │ collapsible transcript   │ sources, generated   │
 *   │ schedule │ + facts, command monitor │ notes                │
 *   └──────────┴──────────────────────────┴──────────────────────┘
 *
 * The editor (DictationPanel) is the "EHR" surface. Mode toggling changes
 * only the mic control in the capture bar; the editor, collapsible
 * transcript/facts panels, and note generation card stay put.
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
 * (client-side verbatim routing via agent), collapsible
 * dictation editor.
 * Phase 9: full-screen clinical app redesign — capture bar +
 * three-panel layout per the Corti clinical design language; patient
 * identity lives in the left rail; runs on its own route.
 */

import type { Corti } from "@corti/sdk";
import { CortiClient } from "@corti/sdk";
import { Loader2, Mic, Radio, Stethoscope, Terminal, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button as UiButton } from "@/components/ui/button";
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
  FactsPanel,
  RecordingStatusBar,
  TranscriptPanel,
  type TranscriptPanelMode,
  useAmbientHandlers,
} from "./AmbientPanel";
import { DictationPanel } from "./DictationPanel";
import { Button, Card, CardHeader } from "./kit";
import { type ExistingNote, NoteGeneration } from "./NoteGeneration";
import { PatientContext, type VisitEditParams } from "./PatientContext";
import { parsePastedTranscript } from "./pastedTranscript";
import {
  type DocumentSource,
  loadSettings,
  SpeechFlexConfig,
  type SpeechFlexSettings,
  saveSettings,
} from "./SpeechFlexConfig";
import { TopBar } from "./TopBar";
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

export function SpeechFlex() {
  const { authConfig, clientId, sdkEnvironment, isReady, tenantName } = useCortiAccessToken();
  const { language, onLanguagesChanged } = useDictationLanguage();
  const [mode, setMode] = useSessionState<WorkspaceMode>("mode", "dictation");
  const [creatingVisit, setCreatingVisit] = useState(false);
  const [dictationText, setDictationText] = useState("");
  const [settings, setSettings] = useState<SpeechFlexSettings>(loadSettings);

  // Persist source dropdown changes back to settings so the selection
  // survives page reloads.
  const handleSourceChange = useCallback((source: DocumentSource) => {
    setSettings((prev) => {
      const next = { ...prev, documentSource: source };
      saveSettings(next);
      return next;
    });
  }, []);

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

  // Ref bridge: the dictation web component lives in the capture bar, the
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

  const {
    visits,
    loading,
    error,
    selectedVisitId,
    selectVisit,
    createVisit,
    updateVisit,
    deleteVisit,
  } = useInteractions(client);

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

  // Persist edits from the left rail's patient context. Rejected promises
  // keep the edit form open (PatientContext awaits this callback).
  const handleSaveVisit = useCallback(
    async (params: VisitEditParams) => {
      if (!selectedVisitId) {
        return;
      }
      try {
        await updateVisit({ interactionId: selectedVisitId, ...params });
      } catch (e) {
        console.error("Failed to update visit:", e);
        throw e;
      }
    },
    [selectedVisitId, updateVisit],
  );

  // Delete a visit from the server-side schedule. Rejected promises re-throw
  // so the delete button in PatientContext can re-enable (it awaits this
  // callback).
  const handleDeleteVisit = useCallback(
    async (visitId: string) => {
      try {
        await deleteVisit({ interactionId: visitId });
      } catch (e) {
        console.error("Failed to delete visit:", e);
        throw e;
      }
    },
    [deleteVisit],
  );

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
    } catch (e) {
      console.error("Failed to create visit:", e);
      throw e;
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

  // Memoize the ambient stream config so it doesn't get a new object identity
  // on every render — the web component re-initializes the stream when the
  // config reference changes, which would interrupt the connection.
  const ambientConfig = useMemo<Corti.StreamConfig>(
    () => ({
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
            // Cast because the app-level FormattingConfig types its fields as
            // `string`, while SDK v6's StreamConfig expects the literal-union
            // StreamFormatting* types. The values come from FORMATTING_OPTIONS,
            // whose entries match the SDK literals exactly.
            formatting: {
              dates: ambientFormatting.dates,
              times: ambientFormatting.times,
              numbers: ambientFormatting.numbers,
              measurements: ambientFormatting.measurements,
              numericRanges: ambientFormatting.numericRanges,
              ordinals: ambientFormatting.ordinals,
            } as Corti.StreamFormatting,
          }
        : {}),
    }),
    [language, settings.factsEnabled, ambientFormatting],
  );

  // Not authenticated — full-height empty state (the docs page gates the
  // same way; the homepage owns the auth form).
  if (!tokenSeen) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Stethoscope className={cn("h-6 w-6 animate-pulse text-muted-foreground")} />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Waiting for authentication…</p>
          <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            Speech Flex runs against your Corti environment. Sign in on the homepage first.
          </p>
        </div>
        <UiButton asChild>
          <Link to="/">Go to homepage to authenticate</Link>
        </UiButton>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <TopBar actions={<SpeechFlexConfig settings={settings} onSettingsChange={setSettings} />}>
        {/* Capture bar — mic web component, always visible. Disabled (greyed
            out, non-interactive) when no visit is selected, since both
            dictation and ambient require a visit to produce output. */}
        <div className="clinical-mic relative flex min-w-0 items-center gap-2">
          {mode === "dictation" ? (
            <CortiDictationComponent
              key="dictation"
              authConfig={authConfig}
              dictationConfig={dictationConfig}
              settingsEnabled={["device", "language", "keybinding"]}
              onTranscript={handleDictationTranscript}
              onCommand={(e) => commandHandlerRef.current?.(e)}
              onLanguagesChanged={onLanguagesChanged}
            />
          ) : mode === "ambient" && selectedVisitId ? (
            <CortiAmbientComponent
              key="ambient"
              authConfig={authConfig}
              interactionId={selectedVisitId}
              ambientConfig={ambientConfig}
              settingsEnabled={["device", "language"]}
              onTranscript={handleAmbientTranscript}
              onFacts={settings.factsEnabled ? handleAmbientFacts : undefined}
              onRecordingStateChanged={handleAmbientRecordingState}
              onLanguagesChanged={onLanguagesChanged}
            />
          ) : (
            <CortiDictationComponent
              key="dictation-disabled"
              authConfig={authConfig}
              dictationConfig={dictationConfig}
              settingsEnabled={["device", "language", "keybinding"]}
              onTranscript={handleDictationTranscript}
              onCommand={(e) => commandHandlerRef.current?.(e)}
              onLanguagesChanged={onLanguagesChanged}
            />
          )}
          {!selectedVisitId && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[5px] bg-background/60 backdrop-grayscale" />
          )}
        </div>

        {/* Mode pills — dictation vs ambient capture, same visit context. */}
        <div className="inline-flex shrink-0 overflow-hidden rounded-[5px] border border-border">
          {(["dictation", "ambient"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "inline-flex h-7 cursor-pointer items-center gap-1.5 px-2.5 text-xs font-medium transition-colors",
                m === "dictation" && "border-r border-border",
                m === "ambient" && greenText,
                mode === "dictation" && m === "dictation" && "text-foreground",
                mode === m
                  ? "bg-lime-600/10 dark:bg-corti-lime/10"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {m === "dictation" ? (
                <Mic className="h-3.5 w-3.5" />
              ) : (
                <Radio className="h-3.5 w-3.5" />
              )}
              {m === "dictation" ? "Dictation" : "Ambient"}
            </button>
          ))}
        </div>

        {/* Capture status — loading indicator + recording state with clips. */}
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-3">
          {interactionLoading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading interaction data…
            </span>
          )}
          {mode === "ambient" &&
            selectedVisitId &&
            (ambientRecording || ambientClips.length > 0) && (
              <RecordingStatusBar isRecording={ambientRecording} clips={ambientClips} />
            )}
        </div>
      </TopBar>

      {/* Panels */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
        {/* Left rail — patient context + visit schedule */}
        <aside className="themed-scrollbar flex w-full shrink-0 flex-col gap-5 border-border px-5 py-4 xl:min-h-0 xl:w-80 xl:overflow-y-auto xl:border-r">
          <PatientContext
            visit={selectedVisit}
            onSave={handleSaveVisit}
            onClear={() => selectVisit(null)}
            onDelete={handleDeleteVisit}
          />
          <div className="border-t border-border pt-5">
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
        </aside>

        {/* Main panel — editor (the "EHR") + collapsible transcript/facts */}
        <main className="themed-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-4 px-6 py-4 xl:overflow-y-auto">
          {selectedVisitId ? (
            <>
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

              {/* Command monitor — detected commands + executed action */}
              {log.length > 0 && (
                <Card>
                  <CardHeader
                    icon={Terminal}
                    title="Command monitor"
                    meta={
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={clearLog}
                        className="h-5 px-1 text-[11px]"
                      >
                        <Trash2 className="h-3 w-3" />
                        Clear
                      </Button>
                    }
                  />
                  <ul className="themed-scrollbar max-h-48 divide-y divide-border overflow-auto">
                    {log.map((entry) => (
                      <li
                        key={`${entry.at}-${entry.id}`}
                        className="flex items-baseline gap-2 px-3 py-1.5 text-[12px]"
                      >
                        <code className="shrink-0 font-mono font-semibold text-foreground">
                          {entry.id}
                        </code>
                        {entry.variables && Object.keys(entry.variables).length > 0 && (
                          <code className="shrink-0 font-mono text-muted-foreground">
                            {JSON.stringify(entry.variables)}
                          </code>
                        )}
                        <span className="truncate text-foreground">{entry.description}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* Collapsible transcript + facts panels */}
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
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Stethoscope className="h-5 w-5 text-muted-foreground" />
              </span>
              <p className="text-[13px] font-semibold text-foreground">Select a visit to begin</p>
            </div>
          )}
        </main>

        {/* Right panel — note generation + generated notes. Same width as the
            main panel (both flex-1) so the two content columns are equal. */}
        <aside className="themed-scrollbar flex w-full min-w-0 flex-col gap-4 border-border px-5 py-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:border-l">
          <NoteGeneration
            authConfig={authConfig}
            sdkEnvironment={sdkEnvironment}
            client={client}
            interactionId={selectedVisitId}
            text={dictationText}
            spokenLanguage={language}
            defaultTemplateKeywords={["soap"]}
            documentSource={settings.documentSource}
            factsEnabled={settings.factsEnabled}
            showInteractionSource={settings.showInteractionSource}
            onSourceChange={handleSourceChange}
            getFacts={() => ambientFacts}
            getSegments={() => effectiveSegments}
            existingNotes={existingNotes}
            onNoteGenerated={handleNoteGenerated}
          />
        </aside>
      </div>
    </div>
  );
}

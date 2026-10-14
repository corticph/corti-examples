/**
 * Applet — CONCEPT: "scribe like me". A clinician uploads their own historical
 * notes, an agent pipeline reviews them and tailors an out-of-the-box Corti
 * Standard template to match their documentation style, then the same
 * transcript can be run through multiple tailored personas (plus the
 * untailored baseline) to see how much the tailoring actually changes the
 * generated note.
 *
 * Three steps: (1) personas & historical notes, (2) style analysis — a
 * two-agent pipeline (`agent.ts`) tailors a Guided Documents template
 * (`documents.ts`), reviewable and editable before saving, (3) generate &
 * compare, from a pasted/sample transcript or live mic capture via
 * `<corti-ambient>`.
 */
import { CortiClient } from "@corti/sdk";
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Fingerprint,
  Loader2,
  Mic,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Square,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "../../context/AuthContext";
import { OUTPUT_LANGUAGES } from "../_shared/corti-documents";
import { CortiAmbientComponent } from "../_shared/cortiAmbientReact";
import { EXAMPLES_ANALYTICS } from "../_shared/examplesAnalytics";
import { useSessionState } from "../_shared/sessionState";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useDictationLanguage } from "../_shared/useDictationLanguage";
import { downloadJson } from "../_shared/utils";
import {
  type AnalysisStage,
  type CandidateTemplate,
  configureScribeAgents,
  describeAgentError,
  retailorForTemplate,
  runStyleAnalysis,
} from "./agent";
import {
  buildCustomTemplateExport,
  describeDocumentsError,
  fetchCandidateTemplates,
  type GeneratedNote,
  generateNote,
  saveAsCustomTemplate,
} from "./documents";
import {
  addNote,
  createPersona,
  type Persona,
  removeNote,
  removePersona,
  resetToSeedPersonas,
  type StyleProfile,
  setCustomTemplate,
  setIdentity as setPersonaIdentity,
  setStyleProfile,
  updateStyleProfile,
  usePersonaStore,
} from "./personaStore";
import { SAMPLE_TRANSCRIPTS } from "./seedPersonas";

const STEPS = [
  { id: 1, label: "Personas & historical notes" },
  { id: 2, label: "Style analysis" },
  { id: 3, label: "Generate & compare" },
] as const;

export function ScribeLikeMe() {
  const { authConfig, refreshAccessToken, sdkEnvironment, clientId, tenantName } =
    useCortiAccessToken();
  const { createInteraction } = useAuth();
  const { language, onLanguagesChanged } = useDictationLanguage();
  const { personas } = usePersonaStore();

  const client = useMemo(
    () =>
      new CortiClient({
        environment: sdkEnvironment,
        auth: { refreshAccessToken },
        analytics: EXAMPLES_ANALYTICS,
      }),
    [sdkEnvironment, refreshAccessToken],
  );

  useEffect(() => {
    setPersonaIdentity(clientId, tenantName);
    configureScribeAgents(authConfig, sdkEnvironment, clientId, tenantName);
  }, [authConfig, sdkEnvironment, clientId, tenantName]);

  const [step, setStep] = useSessionState<1 | 2 | 3>("step", 1);
  const [selectedPersonaId, setSelectedPersonaId] = useSessionState<string | null>(
    "selectedPersonaId",
    personas[0]?.id ?? null,
  );
  const selectedPersona = personas.find((p) => p.id === selectedPersonaId) ?? personas[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Scribe like me</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a clinician's historical notes, let two agents review them and tailor a Corti
          template to match their style, then generate notes from the same transcript across
          personas to see the difference.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              step === s.id
                ? "border-corti-lime bg-corti-lime/5 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.id}. {s.label}
          </button>
        ))}
      </div>

      {step === 1 && (
        <PersonasStep
          personas={personas}
          selectedPersonaId={selectedPersona?.id ?? null}
          onSelect={setSelectedPersonaId}
        />
      )}

      {step === 2 && selectedPersona && (
        <StyleAnalysisStep
          key={selectedPersona.id}
          persona={selectedPersona}
          personas={personas}
          onSelectPersona={setSelectedPersonaId}
          client={client}
        />
      )}

      {step === 2 && !selectedPersona && (
        <p className="text-sm text-muted-foreground">Create a persona in step 1 first.</p>
      )}

      {step === 3 && (
        <GenerateStep
          personas={personas}
          client={client}
          createInteraction={createInteraction}
          authConfig={authConfig}
          language={language}
          onLanguagesChanged={onLanguagesChanged}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------- //
// Step 1: personas & historical notes
// --------------------------------------------------------------------- //
function PersonasStep({
  personas,
  selectedPersonaId,
  onSelect,
}: {
  personas: Persona[];
  selectedPersonaId: string | null;
  onSelect: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newSpecialty, setNewSpecialty] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [confirmingReset, setConfirmingReset] = useState(false);
  const selected = personas.find((p) => p.id === selectedPersonaId) ?? null;

  const handleCreate = () => {
    if (!newName.trim()) {
      return;
    }
    const persona = createPersona(newName.trim(), newSpecialty.trim());
    onSelect(persona.id);
    setNewName("");
    setNewSpecialty("");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Personas
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-xs text-muted-foreground"
            onClick={() => setConfirmingReset(true)}
          >
            <RotateCcw className="h-3 w-3" /> Restore samples
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {personas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={`rounded-md border p-3 text-left transition-colors ${
                p.id === selectedPersonaId
                  ? "border-corti-lime bg-corti-lime/5"
                  : "border-border hover:bg-accent"
              }`}
            >
              <p className="text-sm font-semibold text-foreground">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {p.specialty || "—"} · {p.notes.length} note
                {p.notes.length === 1 ? "" : "s"}
              </p>
              <Badge
                variant={p.styleProfile ? "default" : "outline"}
                className="mt-1.5 text-[10px]"
              >
                {p.styleProfile ? "tailored" : "not analyzed"}
              </Badge>
            </button>
          ))}
          {personas.length === 0 && (
            <p className="text-sm text-muted-foreground">No personas yet — create one below.</p>
          )}
        </div>

        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <Input
            placeholder="Clinician name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            placeholder="Specialty"
            value={newSpecialty}
            onChange={(e) => setNewSpecialty(e.target.value)}
          />
          <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
            <Plus className="h-3.5 w-3.5" /> Create persona
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Historical notes {selected ? `for ${selected.name}` : ""}
        </p>
        {!selected ? (
          <p className="text-sm text-muted-foreground">Select or create a persona.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Paste the clinician's own past notes here. The style agent reads these to learn how
              this clinician documents — more notes, and more varied visit types, help it separate
              real style patterns from one-off content.
            </p>
            <div className="flex flex-col gap-2">
              {selected.notes.map((note, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: plain-text notes have no stable id
                  key={`${selected.id}-note-${i}`}
                  className="relative rounded-md border border-border p-3"
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute right-1.5 top-1.5 h-6 w-6 p-0"
                    onClick={() => removeNote(selected.id, i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <pre className="whitespace-pre-wrap pr-6 font-sans text-sm text-foreground">
                    {note}
                  </pre>
                </div>
              ))}
              {selected.notes.length === 0 && (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              )}
            </div>
            <Textarea
              rows={6}
              placeholder="Paste a historical note…"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <Button
              size="sm"
              className="w-fit"
              onClick={() => {
                addNote(selected.id, noteDraft);
                setNoteDraft("");
              }}
              disabled={!noteDraft.trim()}
            >
              <Plus className="h-3.5 w-3.5" /> Add note
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => removePersona(selected.id)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete persona
            </Button>
          </>
        )}
      </div>

      <Dialog open={confirmingReset} onOpenChange={setConfirmingReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore sample personas?</DialogTitle>
            <DialogDescription>
              This replaces every persona — including any you've added, edited, or analyzed — with a
              fresh copy of the four built-in sample personas. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmingReset(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                resetToSeedPersonas();
                onSelect("");
                setConfirmingReset(false);
              }}
            >
              Restore samples
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --------------------------------------------------------------------- //
// Step 2: style analysis
// --------------------------------------------------------------------- //
function StyleAnalysisStep({
  persona,
  personas,
  onSelectPersona,
  client,
}: {
  persona: Persona;
  personas: Persona[];
  onSelectPersona: (id: string) => void;
  client: CortiClient;
}) {
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [stage, setStage] = useState<AnalysisStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cached for the "change template" picker in StyleProfileEditor, so it has
  // options even before "Analyze" is (re-)run — refreshed every time
  // analysis actually runs, to stay current with the tenant's templates.
  const [candidates, setCandidates] = useState<CandidateTemplate[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCandidateTemplates(client)
      .then((c) => {
        if (!cancelled) {
          setCandidates(c);
        }
      })
      .catch(() => {
        /* ignore — the "change template" picker just won't have options yet */
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const runAnalysis = async () => {
    setStatus("running");
    setError(null);
    setStage(null);
    try {
      const fetched = await fetchCandidateTemplates(client);
      setCandidates(fetched);
      if (fetched.length === 0) {
        throw new Error("No Corti Standard templates were returned for this tenant.");
      }
      const profile = await runStyleAnalysis(
        persona.name,
        persona.specialty,
        persona.notes,
        fetched,
        setStage,
      );
      setStyleProfile(persona.id, profile);
      setStatus("idle");
    } catch (e) {
      setError(describeAgentError(e));
      setStatus("error");
    }
  };

  const profile = persona.styleProfile;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs">Persona</Label>
        <Select value={persona.id} onValueChange={onSelectPersona}>
          <SelectTrigger className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {personas.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={() => void runAnalysis()}
          disabled={status === "running" || persona.notes.length === 0}
        >
          {status === "running" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Fingerprint className="h-4 w-4" />
          )}
          {profile ? "Re-run analysis" : "Analyze historical notes & tailor template"}
        </Button>
      </div>

      {persona.notes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Add historical notes for {persona.name} in step 1 first.
        </p>
      )}

      {status === "running" && (
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "reviewing", label: "Style Reviewer" },
              { id: "tailoring", label: "Template Tailor" },
            ] as const
          ).map((s, i) => {
            const isActive = stage === s.id;
            const isDone = stage === "tailoring" && s.id === "reviewing";
            return (
              <div key={s.id} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground">→</span>}
                <div
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    isDone
                      ? "bg-green-500/15 text-green-700 dark:text-green-400"
                      : isActive
                        ? "bg-corti-lime/15 text-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isActive && <Loader2 className="h-3 w-3 animate-spin" />}
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {profile && (
        <StyleProfileEditor
          key={profile.analyzedAt}
          personaId={persona.id}
          personaName={persona.name}
          profile={profile}
          candidates={candidates}
          client={client}
        />
      )}
    </div>
  );
}

function StyleProfileEditor({
  personaId,
  personaName,
  profile,
  candidates,
  client,
}: {
  personaId: string;
  personaName: string;
  profile: NonNullable<Persona["styleProfile"]>;
  candidates: CandidateTemplate[];
  client: CortiClient;
}) {
  const [templatePrompt, setTemplatePrompt] = useState(profile.templatePromptOverride ?? "");
  const [showDefaults, setShowDefaults] = useState(false);
  const [sectionEdits, setSectionEdits] = useState<
    Record<string, { content: string; style: string }>
  >(() =>
    Object.fromEntries(
      profile.sections.map((s) => [
        s.sectionId,
        {
          content: s.contentPromptOverride ?? "",
          style: s.writingStylePromptOverride ?? "",
        },
      ]),
    ),
  );
  const [headingEdits, setHeadingEdits] = useState<Record<string, string>>(() =>
    Object.fromEntries(profile.sections.map((s) => [s.sectionId, s.headingOverride ?? ""])),
  );
  const [editingHeadingId, setEditingHeadingId] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null);
  const [retailoring, setRetailoring] = useState(false);
  const [retailorError, setRetailorError] = useState<string | null>(null);

  // Always include the profile's current template even if it fell out of
  // (or never made) the fetched shortlist, so the picker never shows a
  // mismatched or blank selection.
  const templateOptions = candidates.some((c) => c.templateId === profile.templateId)
    ? candidates
    : [
        { templateId: profile.templateId, templateName: profile.templateName, sections: [] },
        ...candidates,
      ];

  // The current draft — profile.sections plus whatever's in the (unsaved)
  // text fields above — is what "Save as custom template" and "Download
  // JSON" should act on, not the last-persisted profile prop, so neither
  // action can silently ignore edits still sitting in the textareas.
  const draftProfile: StyleProfile = {
    ...profile,
    templatePromptOverride: templatePrompt.trim() || null,
    sections: profile.sections.map((s) => ({
      ...s,
      headingOverride: headingEdits[s.sectionId]?.trim() || null,
      contentPromptOverride: sectionEdits[s.sectionId]?.content.trim() || null,
      writingStylePromptOverride: sectionEdits[s.sectionId]?.style.trim() || null,
    })),
  };

  const save = () => {
    updateStyleProfile(personaId, {
      templatePromptOverride: templatePrompt.trim() || null,
      sectionEdits: profile.sections.map((s) => ({
        sectionId: s.sectionId,
        headingOverride: headingEdits[s.sectionId]?.trim() || null,
        contentPromptOverride: sectionEdits[s.sectionId]?.content.trim() || null,
        writingStylePromptOverride: sectionEdits[s.sectionId]?.style.trim() || null,
      })),
    });
  };

  const handleSaveAsCustomTemplate = async () => {
    setSavingTemplate(true);
    setSaveTemplateError(null);
    try {
      const result = await saveAsCustomTemplate(client, personaName, draftProfile);
      save();
      setCustomTemplate(personaId, { ...result, createdAt: new Date().toISOString() });
    } catch (e) {
      setSaveTemplateError(describeDocumentsError(e));
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDownloadJson = () => {
    const payload = buildCustomTemplateExport(personaName, draftProfile);
    const filename = `${personaName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}-custom-template.json`;
    downloadJson(filename, payload);
  };

  const handleChangeTemplate = async (templateId: string) => {
    if (templateId === profile.templateId) {
      return;
    }
    const candidate = candidates.find((c) => c.templateId === templateId);
    if (!candidate) {
      return;
    }
    setRetailoring(true);
    setRetailorError(null);
    try {
      const newProfile = await retailorForTemplate(profile.styleSummary, candidate);
      setStyleProfile(personaId, newProfile);
    } catch (e) {
      setRetailorError(describeAgentError(e));
    } finally {
      setRetailoring(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Narrative style summary, leading with what the agents concluded. */}
      <div className="rounded-md border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Style summary
          </p>
          <span className="text-xs text-muted-foreground">
            analyzed {new Date(profile.analyzedAt).toLocaleString()}
          </span>
        </div>
        <p className="text-sm text-foreground">{profile.styleSummary}</p>
      </div>

      {/* Template-level override, its own box so it isn't confused with the summary above. */}
      <div className="rounded-md border border-border p-3">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Recommended default template:</span>
          <Select
            value={profile.templateId}
            onValueChange={(id) => void handleChangeTemplate(id)}
            disabled={retailoring}
          >
            <SelectTrigger className="h-7 w-auto min-w-[200px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templateOptions.map((c) => (
                <SelectItem key={c.templateId} value={c.templateId}>
                  {c.templateName}
                  {c.sections.length > 0 ? ` (${c.sections.length} sections)` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {retailoring && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Not the right structural fit? Switching re-runs just the Template Tailor step against the
          new template's own sections, reusing the style summary above.
        </p>
        {retailorError && <p className="mb-2 text-xs text-destructive">{retailorError}</p>}
        <Label className="text-xs">
          Template-level instruction override (applies to every section)
        </Label>
        <Textarea
          rows={2}
          value={templatePrompt}
          onChange={(e) => setTemplatePrompt(e.target.value)}
          placeholder="No cross-section override"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Section overrides
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-xs text-muted-foreground"
          onClick={() => setShowDefaults((v) => !v)}
        >
          {showDefaults ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {showDefaults ? "Hide defaults" : "Compare to defaults"}
        </Button>
      </div>

      {profile.sections.map((s) => (
        <div key={s.sectionId} className="rounded-md border border-border p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {s.family ?? ""}
          </p>
          <div className="mb-2 flex flex-wrap items-start gap-x-4 gap-y-1">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">
                Default section title
              </Label>
              <p className="text-sm text-muted-foreground">{s.defaultHeading}</p>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">
                Tailored section title
              </Label>
              {editingHeadingId === s.sectionId ? (
                <Input
                  autoFocus
                  className="h-7 w-56 text-sm font-semibold"
                  value={headingEdits[s.sectionId] ?? ""}
                  placeholder={s.defaultHeading}
                  onChange={(e) =>
                    setHeadingEdits((prev) => ({ ...prev, [s.sectionId]: e.target.value }))
                  }
                  onBlur={() => setEditingHeadingId(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setEditingHeadingId(null);
                    }
                  }}
                />
              ) : (
                <div className="flex items-center gap-1">
                  <p className="text-sm font-semibold text-foreground">
                    {headingEdits[s.sectionId]?.trim() || s.defaultHeading}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 p-0"
                    onClick={() => setEditingHeadingId(s.sectionId)}
                    aria-label={`Edit tailored title for ${s.defaultHeading}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
          {s.rationale && (
            <p className="mb-2 text-xs italic text-muted-foreground">{s.rationale}</p>
          )}
          <div className={showDefaults ? "grid gap-3 sm:grid-cols-2" : undefined}>
            {showDefaults && (
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">
                  Default — what to include
                </Label>
                <Textarea readOnly rows={3} value={s.defaultContentPrompt} className="text-xs" />
              </div>
            )}
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">
                {showDefaults
                  ? "Tailored (blank = inherit default)"
                  : "Content override (blank = inherit default)"}
              </Label>
              <Textarea
                rows={3}
                className="text-xs"
                value={sectionEdits[s.sectionId]?.content ?? ""}
                onChange={(e) =>
                  setSectionEdits((prev) => ({
                    ...prev,
                    [s.sectionId]: {
                      ...prev[s.sectionId],
                      content: e.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>
          <div className={`mt-2 ${showDefaults ? "grid gap-3 sm:grid-cols-2" : ""}`}>
            {showDefaults && (
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">
                  Default — writing style
                </Label>
                <Textarea
                  readOnly
                  rows={2}
                  value={s.defaultWritingStylePrompt}
                  className="text-xs"
                />
              </div>
            )}
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">
                {showDefaults
                  ? "Tailored (blank = inherit default)"
                  : "Writing style override (blank = inherit default)"}
              </Label>
              <Textarea
                rows={2}
                className="text-xs"
                value={sectionEdits[s.sectionId]?.style ?? ""}
                onChange={(e) =>
                  setSectionEdits((prev) => ({
                    ...prev,
                    [s.sectionId]: {
                      ...prev[s.sectionId],
                      style: e.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>
        </div>
      ))}

      <div className="rounded-md border border-dashed border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Persist this tailoring
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Everything above is applied at generation time only (Corti's "Path 2" pattern) — no
          resource is created until you save below. Unsaved edits in the fields above are included
          automatically.
        </p>
        {profile.customTemplate && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">{profile.customTemplate.templateName}</Badge>
            <span className="text-muted-foreground">
              saved {new Date(profile.customTemplate.createdAt).toLocaleString()} · template id{" "}
              {profile.customTemplate.templateId}
            </span>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleSaveAsCustomTemplate()}
            disabled={savingTemplate}
          >
            {savingTemplate ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {profile.customTemplate ? "Re-save as new custom template" : "Save as custom template"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownloadJson}>
            <Download className="h-3.5 w-3.5" /> Download JSON
          </Button>
        </div>
        {saveTemplateError && <p className="mt-2 text-xs text-destructive">{saveTemplateError}</p>}
      </div>

      <Button size="sm" className="w-fit" onClick={save}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Save changes
      </Button>
    </div>
  );
}

// --------------------------------------------------------------------- //
// Step 3: generate & compare
// --------------------------------------------------------------------- //
function GenerateStep({
  personas,
  client,
  createInteraction,
  authConfig,
  language,
  onLanguagesChanged,
}: {
  personas: Persona[];
  client: CortiClient;
  createInteraction: () => Promise<{ interactionId: string }>;
  authConfig: ReturnType<typeof useCortiAccessToken>["authConfig"];
  language: string;
  onLanguagesChanged: (e: CustomEvent) => void;
}) {
  const [transcript, setTranscript] = useSessionState("transcript", "");
  const [outputLanguage, setOutputLanguage] = useSessionState("outputLanguage", "en");
  const [selectedIds, setSelectedIds] = useSessionState<string[]>(
    "generateSelectedIds",
    personas
      .filter((p) => p.styleProfile)
      .slice(0, 2)
      .map((p) => p.id),
  );
  const [includeBaseline, setIncludeBaseline] = useSessionState("includeBaseline", true);
  const [interactionId, setInteractionId] = useSessionState<string | undefined>(
    "interactionId",
    undefined,
  );
  const [capturing, setCapturing] = useState(false);
  const [creatingInteraction, setCreatingInteraction] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<
    Array<{
      personaName: string;
      tailored: boolean;
      templateName: string;
      note: GeneratedNote;
    }>
  >([]);

  const ambientConfig = useMemo(
    () => ({
      transcription: {
        primaryLanguage: language,
        isDiarization: false,
        isMultichannel: false,
        participants: [],
      },
      mode: { type: "transcription" as const },
      audioEvents: { enabled: true },
    }),
    [language],
  );

  const startCapture = async () => {
    setCreatingInteraction(true);
    setError(null);
    try {
      const interaction = await createInteraction();
      setInteractionId(interaction.interactionId);
      setCapturing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingInteraction(false);
    }
  };

  const handleTranscriptEvent = (e: CustomEvent) => {
    const data = e.detail?.data;
    if (!Array.isArray(data)) {
      return;
    }
    const text = data.map((seg: { transcript: string }) => seg.transcript).join(" ");
    if (text) {
      setTranscript((prev) => (prev ? `${prev} ${text}` : text));
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const runGenerate = async () => {
    if (!transcript.trim() || selectedIds.length === 0) {
      return;
    }
    setGenerating(true);
    setError(null);
    setResults([]);
    try {
      const jobs: Array<
        Promise<{
          personaName: string;
          tailored: boolean;
          templateName: string;
          note: GeneratedNote;
        }>
      > = [];
      for (const id of selectedIds) {
        const persona = personas.find((p) => p.id === id);
        if (!persona?.styleProfile) {
          continue;
        }
        const profile = persona.styleProfile;
        jobs.push(
          generateNote(client, profile, transcript, outputLanguage, true).then((note) => ({
            personaName: persona.name,
            tailored: true,
            templateName: profile.templateName,
            note,
          })),
        );
        if (includeBaseline) {
          jobs.push(
            generateNote(client, profile, transcript, outputLanguage, false).then((note) => ({
              personaName: persona.name,
              tailored: false,
              templateName: profile.templateName,
              note,
            })),
          );
        }
      }
      const settled = await Promise.all(jobs);
      setResults(settled);
    } catch (e) {
      setError(describeDocumentsError(e));
    } finally {
      setGenerating(false);
    }
  };

  const analyzable = personas.filter((p) => p.styleProfile);

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-3">
        <div>
          <Label className="text-xs">Sample transcript</Label>
          <Select
            onValueChange={(id) => {
              const t = SAMPLE_TRANSCRIPTS.find((s) => s.id === id);
              if (t) {
                setTranscript(t.text);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a sample" />
            </SelectTrigger>
            <SelectContent>
              {SAMPLE_TRANSCRIPTS.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Or capture live audio</Label>
          <div className="mt-1 flex items-center gap-2">
            {!capturing ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void startCapture()}
                disabled={creatingInteraction}
              >
                {creatingInteraction ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Mic className="h-3.5 w-3.5" />
                )}
                Start live capture
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setCapturing(false)}>
                <Square className="h-3.5 w-3.5" /> Stop
              </Button>
            )}
          </div>
          {capturing && interactionId && (
            <div className="mt-2">
              <CortiAmbientComponent
                authConfig={authConfig}
                interactionId={interactionId}
                ambientConfig={ambientConfig}
                settingsEnabled={["device", "language"]}
                onTranscript={handleTranscriptEvent}
                onLanguagesChanged={onLanguagesChanged}
              />
            </div>
          )}
        </div>

        <div>
          <Label className="text-xs">Transcript</Label>
          <Textarea
            rows={10}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Transcript text will appear here — or paste your own."
            className="font-mono text-sm"
          />
        </div>

        <div>
          <Label className="text-xs">Output language</Label>
          <Select value={outputLanguage} onValueChange={setOutputLanguage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTPUT_LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Personas to generate
          </p>
          {analyzable.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No tailored personas yet — run style analysis in step 2 first.
            </p>
          )}
          <div className="mt-1 flex flex-col gap-1.5">
            {analyzable.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(p.id)}
                  onChange={() => toggleSelected(p.id)}
                  className="h-3.5 w-3.5 accent-corti-lime"
                />
                {p.name}
              </label>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={includeBaseline}
              onChange={(e) => setIncludeBaseline(e.target.checked)}
              className="h-3.5 w-3.5 accent-corti-lime"
            />
            Also generate out-of-the-box (untailored) baseline
          </label>
        </div>

        <Button
          size="sm"
          className="w-fit"
          onClick={() => void runGenerate()}
          disabled={generating || !transcript.trim() || selectedIds.length === 0}
        >
          {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Generate notes
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {results.map((r, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: a persona can appear twice (tailored + baseline)
            key={`${r.personaName}-${r.tailored}-${i}`}
            className="rounded-md border border-border p-3"
          >
            <p className="text-sm font-semibold text-foreground">
              {r.personaName} — {r.tailored ? "tailored" : "out-of-the-box"}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              {r.templateName}
              {r.note.creditsConsumed != null ? ` · ${r.note.creditsConsumed} credits` : ""}
            </p>
            {r.note.sections.map((s) => (
              <div key={s.sectionId} className="mb-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                  {s.heading}
                </h4>
                <p className="whitespace-pre-wrap text-sm text-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

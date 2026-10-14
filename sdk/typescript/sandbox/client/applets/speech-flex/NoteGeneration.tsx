/**
 * NoteGeneration — template selection and document generation.
 *
 * Six generation paths controlled by `documentSource`:
 *   - **combined** — explicit `context` array mixing editor text + ambient
 *     transcript segments + non-discarded facts (all three, when available).
 *   - **combined-no-facts** — explicit `context` with editor text + transcript
 *     segments only (no facts).
 *   - **interaction** — `interactionId` path: the SDK pulls persisted
 *     transcript + facts server-side. Requires a selected visit.
 *   - **text** — explicit `context` with just the editor text.
 *   - **transcript** — explicit `context` with just transcript segments.
 *   - **facts** — explicit `context` with just non-discarded facts.
 *
 * When "preserve dictated text verbatim" is enabled and the active source
 * includes editor text, the dictated text is prepended as a verbatim section
 * client-side — no extra API call. A single standard generation call is made,
 * and the verbatim [heading, text] pair is unshifted onto the result.
 *
 * Existing notes persisted on the interaction are fetched by the parent
 * (`SpeechFlex`) and passed as the `existingNotes` prop. This component does
 * not manage any fetch lifecycle — it only renders existing notes alongside
 * newly generated ones.
 *
 * Template defaults to a per-user preference stored in localStorage, with the
 * ability to select an alternate template at generation time. The template
 * list is filtered by the spoken language.
 *
 * Multiple notes can be generated per visit — each result is prepended to a
 * list so the clinician can compare outputs from different templates or
 * recording stages.
 *
 * The generated document includes a `sections` array (in template order) with
 * `sectionId` and `heading` — used to render section headings and order
 * sections correctly, instead of relying on the UUID keys of `stringDocument`.
 */

import type { Corti, CortiAuth, CortiClient } from "@corti/sdk";
import { Check, ChevronDown, ChevronRight, Copy, FileText, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deduplicateTemplates,
  describeDocumentsError,
  findDefaultTemplate,
  OUTPUT_LANGUAGES,
  useGuidedTemplates,
} from "../_shared/corti-documents";
import type { DiarizedSegment } from "../_shared/diarizedTranscript";
import type { CortiSdkEnvironment } from "../_shared/useCortiAccessToken";
import { cn } from "../_shared/utils";
import type { DocumentSource } from "./SpeechFlexConfig";

const DEFAULT_TEMPLATE_KEY = "speech-flex.defaultTemplate";

/** Section entry returned on the document — not in the SDK type yet. */
interface GeneratedSection {
  sectionId: string;
  heading: string;
}

/** The document with its `sections` array and `id` (SDK type omits these). */
interface GeneratedDocument extends Corti.GuidedEphemeralDocument {
  id?: string;
  sections?: GeneratedSection[];
}

/** A note fetched from the server (persisted on the interaction). */
export interface ExistingNote {
  id: string;
  templateName: string;
  createdAt: number;
  orderedSections: [string, string][];
  creditsConsumed: number;
}

/** A note generated in the current session, or fetched from the server. */
interface GeneratedNote extends ExistingNote {
  /** True for notes fetched from the interaction's persisted documents. */
  isExisting?: boolean;
}

/**
 * BCP 47 primary subtag (e.g. "en" from "en-GB").
 */
function primarySubtag(tag: string): string {
  return tag.split("-")[0];
}

/**
 * A template matches the spoken language if it has no language-specific
 * tweaks (empty `languages`), or if any of its language tags share the same
 * primary subtag as the spoken language.
 */
function templateMatchesLanguage(t: Corti.GuidedTemplate, spoken: string): boolean {
  if (t.languages.length === 0) {
    return true;
  }
  const spokenPrimary = primarySubtag(spoken);
  return t.languages.some((l) => primarySubtag(l) === spokenPrimary);
}

/**
 * Ordered [heading, content] pairs from a generated document.
 */
function extractOrderedSections(doc: GeneratedDocument): [string, string][] {
  if (doc.sections && doc.sections.length > 0) {
    return doc.sections
      .map((s) => [s.heading, doc.stringDocument[s.sectionId] ?? ""] as [string, string])
      .filter(([, content]) => content.length > 0);
  }
  return Object.entries(doc.stringDocument).filter(([, content]) => content.length > 0);
}

export function NoteGeneration({
  authConfig,
  sdkEnvironment,
  client,
  interactionId,
  text,
  spokenLanguage,
  defaultTemplateKeywords,
  documentSource = "combined",
  getFacts,
  getSegments,
  existingNotes,
  onNoteGenerated,
}: {
  authConfig: CortiAuth.AuthTokenDerivable;
  sdkEnvironment: CortiSdkEnvironment;
  /** Validated SDK client from the parent (gated by isReady). Null when auth isn't ready. */
  client: CortiClient | null;
  /** Set when a visit is selected. Used for the "interaction" source path. */
  interactionId: string | null;
  /** Editor text — always available, used by "combined" and "text" paths. */
  text: string;
  /** BCP 47 tag from the dictation/ambient language selector — filters the template list. */
  spokenLanguage: string;
  /** Keywords to auto-select a sensible default template (e.g. ["soap"]). */
  defaultTemplateKeywords: string[];
  /** Which context source(s) to use for generation. */
  documentSource?: DocumentSource;
  /** Getter for live facts. */
  getFacts?: () => Corti.StreamFact[];
  /** Getter for live transcript segments. */
  getSegments?: () => DiarizedSegment[];
  /** Notes persisted on the interaction, fetched by the parent. */
  existingNotes: ExistingNote[];
  /** Called when a note is generated, with the persisted document ID (if available). */
  onNoteGenerated?: (documentId: string) => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [manualTemplateId, setManualTemplateId] = useState("");
  const [language, setLanguage] = useState(spokenLanguage);
  const { templates, loading: templatesLoading } = useGuidedTemplates(
    authConfig,
    sdkEnvironment,
    language,
  );
  const [sourceOverride, setSourceOverride] = useState<DocumentSource | null>(null);
  const [generatedNotes, setGeneratedNotes] = useState<GeneratedNote[]>([]);
  const [generating, setGenerating] = useState(false);
  const [preserveDictatedText, setPreserveDictatedText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // The effective source is the per-request override if set, otherwise the
  // config default. Resets when the config default changes.
  useEffect(() => {
    setSourceOverride(null);
  }, [documentSource]);

  const activeSource = sourceOverride ?? documentSource;

  // Deduplicate by name, then filter by spoken language.
  const uniqueTemplates = deduplicateTemplates(templates);
  const filteredTemplates = uniqueTemplates.filter((t) =>
    templateMatchesLanguage(t, spokenLanguage),
  );

  // Clear the selected template if it's filtered out by a language change.
  useEffect(() => {
    if (templateId && !filteredTemplates.some((t) => t.id === templateId)) {
      setTemplateId("");
    }
  }, [filteredTemplates, templateId]);

  // Restore per-user default template preference.
  useEffect(() => {
    if (templateId) {
      return;
    }
    const saved = localStorage.getItem(DEFAULT_TEMPLATE_KEY);
    if (saved && filteredTemplates.some((t) => t.id === saved)) {
      setTemplateId(saved);
      return;
    }
    if (filteredTemplates.length > 0) {
      const match = findDefaultTemplate(filteredTemplates, ...defaultTemplateKeywords);
      if (match) {
        setTemplateId(match.id);
      }
    }
  }, [filteredTemplates, templateId, defaultTemplateKeywords]);

  // Persist template selection as the user's default.
  useEffect(() => {
    if (templateId) {
      localStorage.setItem(DEFAULT_TEMPLATE_KEY, templateId);
    }
  }, [templateId]);

  // Clear session-generated notes when the interaction changes.
  useEffect(() => {
    setGeneratedNotes([]);
    setError(null);
  }, [interactionId]);

  // Merge existing (server-fetched) notes with session-generated notes.
  // Existing notes are rendered first (oldest), generated notes prepended (newest).
  const allNotes: GeneratedNote[] = [
    ...generatedNotes,
    ...existingNotes.map((n): GeneratedNote => ({ ...n, isExisting: true })),
  ];

  const effectiveTemplateId = templateId || manualTemplateId.trim();

  // Determine whether there's enough context to generate, based on the source.
  const hasContext = (() => {
    switch (activeSource) {
      case "combined": {
        const hasText = text.trim().length > 0;
        const hasSegs = (getSegments?.() ?? []).length > 0;
        const hasFacts = (getFacts?.() ?? []).some((f) => !f.isDiscarded);
        return hasText || hasSegs || hasFacts;
      }
      case "combined-no-facts": {
        const hasText = text.trim().length > 0;
        const hasSegs = (getSegments?.() ?? []).length > 0;
        return hasText || hasSegs;
      }
      case "interaction":
        return !!interactionId;
      case "text":
        return text.trim().length > 0;
      case "transcript":
        return (getSegments?.() ?? []).length > 0;
      case "facts":
        return (getFacts?.() ?? []).some((f) => !f.isDiscarded);
    }
  })();

  const canGenerate = !!effectiveTemplateId && hasContext && !!client;

  // The dictated editor text is only sent as context for the combined and
  // "text" sources, so the preserve-verbatim toggle is only meaningful there.
  const dictationInContext =
    (activeSource === "combined" ||
      activeSource === "combined-no-facts" ||
      activeSource === "text") &&
    text.trim().length > 0;

  const generate = async () => {
    if (!canGenerate || generating || !client) {
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const preserve = preserveDictatedText && dictationInContext;

      // When "preserve dictated text" is on, the dictated text is prepended
      // as a verbatim section client-side — no API call needed for it. Only
      // a single standard generation call is made (same as preserve off),
      // and the verbatim [heading, text] pair is prepended to the result.

      // --- Build the standard context array ---
      const buildStandardContext = (): Corti.GuidedDocumentContext[] => {
        const context: Corti.GuidedDocumentContext[] = [];

        if (
          activeSource === "combined" ||
          activeSource === "combined-no-facts" ||
          activeSource === "text"
        ) {
          if (text.trim()) {
            context.push({ type: "text", text });
          }
        }

        if (
          activeSource === "combined" ||
          activeSource === "combined-no-facts" ||
          activeSource === "transcript"
        ) {
          const segments = getSegments?.() ?? [];
          if (segments.length > 0) {
            context.push({
              type: "transcript",
              transcript: {
                transcripts: segments.map((s) => ({
                  text: s.transcript,
                  speakerId: s.speakerId,
                  channel: s.participant?.channel,
                  start: s.time?.start != null ? Math.round(s.time.start) : undefined,
                  end: s.time?.end != null ? Math.round(s.time.end) : undefined,
                })),
              },
            });
          }
        }

        if (activeSource === "combined" || activeSource === "facts") {
          const facts = (getFacts?.() ?? []).filter((f) => !f.isDiscarded);
          for (const f of facts) {
            context.push({
              type: "facts",
              facts: [{ text: f.text, group: f.group }],
            });
          }
        }

        return context;
      };

      const plainTemplateRef: Corti.GuidedTemplateRef = {
        templateId: effectiveTemplateId,
      };

      let result: Corti.GuidedDocumentsCreateEphemeralResponse;

      if (activeSource === "interaction" && interactionId) {
        result = await client.documents.generate({
          outputLanguage: language,
          interactionId,
          templateRef: plainTemplateRef,
        });
      } else {
        const context = buildStandardContext();
        result = await client.documents.generate({
          outputLanguage: language,
          templateRef: plainTemplateRef,
          context,
        });
      }

      const doc = result.document as GeneratedDocument;
      const templateName =
        filteredTemplates.find((t) => t.id === effectiveTemplateId)?.name ?? "Custom template";

      const orderedSections = extractOrderedSections(doc);

      if (preserve) {
        const selectedTemplateName =
          filteredTemplates.find((t) => t.id === effectiveTemplateId)?.name ?? "Clinical Note";
        const dictationHeading =
          selectedTemplateName.replace(/\s*\([^)]*\)\s*/g, "").trim() || "Clinical Note";
        orderedSections.unshift([dictationHeading, text]);
      }

      const note: GeneratedNote = {
        id: doc.id ?? crypto.randomUUID(),
        templateName: preserve ? `${templateName} (verbatim dictation)` : templateName,
        createdAt: Date.now(),
        orderedSections,
        creditsConsumed: result.usageInfo?.creditsConsumed ?? 0,
      };
      setGeneratedNotes((prev) => [note, ...prev]);
      if (doc.id) {
        onNoteGenerated?.(doc.id);
      }
    } catch (e) {
      setError(describeDocumentsError(e));
    } finally {
      setGenerating(false);
    }
  };

  const copyNote = async (note: GeneratedNote) => {
    const noteText = note.orderedSections
      .map(([heading, content]) => `${heading}\n${content}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(noteText);
      setCopiedId(note.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  };

  const removeNote = (id: string) => {
    setGeneratedNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const copySection = async (noteId: string, heading: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedSection(`${noteId}:${heading}`);
      window.setTimeout(() => setCopiedSection(null), 1500);
    } catch {
      // ignore
    }
  };

  const copySectionWithHeading = async (noteId: string, heading: string, content: string) => {
    try {
      await navigator.clipboard.writeText(`${heading}\n${content}`);
      setCopiedSection(`${noteId}:${heading}`);
      window.setTimeout(() => setCopiedSection(null), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Generate note</h3>
      </div>

      {/* Template + language + source selectors */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Template</Label>
          {filteredTemplates.length > 0 ? (
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {filteredTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={manualTemplateId}
              onChange={(e) => setManualTemplateId(e.target.value)}
              placeholder={
                templatesLoading
                  ? "Loading templates…"
                  : "No templates found, paste a template UUID"
              }
            />
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Output language</Label>
          <Select value={language} onValueChange={setLanguage}>
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
        <div className="space-y-1.5">
          <Label className="text-xs">
            Source
            {sourceOverride && <span className="text-muted-foreground/60"> (override)</span>}
          </Label>
          <Select
            value={activeSource}
            onValueChange={(v) => setSourceOverride(v as DocumentSource)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="combined">Combined (dictation + ambient + facts)</SelectItem>
              <SelectItem value="combined-no-facts">Combined (dictation + ambient)</SelectItem>
              <SelectItem value="interaction">Interaction (server-side)</SelectItem>
              <SelectItem value="text">Editor text only</SelectItem>
              <SelectItem value="transcript">Ambient only</SelectItem>
              <SelectItem value="facts" disabled={!getFacts}>
                Facts only
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Generate button + preserve-dictated-text toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={generating || !canGenerate}
          className={cn(
            "inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-medium transition-colors",
            "border-lime-600 text-foreground hover:bg-lime-600/10 dark:border-corti-lime dark:hover:bg-corti-lime/10",
            "disabled:opacity-50",
          )}
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          {generating ? "Generating…" : "Generate note"}
        </button>

        {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps the Checkbox control */}
        <label
          className={cn(
            "flex items-center gap-2 text-xs",
            dictationInContext ? "text-muted-foreground" : "text-muted-foreground/50",
          )}
          title={
            dictationInContext
              ? "Prepend the dictated editor text to the generated note verbatim."
              : "Only has an effect when the source includes editor text (Combined or Editor text only)."
          }
        >
          <Checkbox
            checked={preserveDictatedText && dictationInContext}
            disabled={!dictationInContext}
            onCheckedChange={(v) => setPreserveDictatedText(v === true)}
          />
          Preserve dictated text verbatim
        </label>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Notes (existing + generated) */}
      {allNotes.length > 0 && (
        <div className="flex flex-col gap-2">
          {allNotes.map((note) => {
            const isExpanded = expandedId === note.id;
            return (
              <div
                key={note.id}
                className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : note.id)}
                    className="flex items-center gap-2 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="text-xs font-medium text-foreground">{note.templateName}</span>
                    {note.isExisting && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Saved
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(note.createdAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Credits: {note.creditsConsumed}
                    </span>
                  </button>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void copyNote(note)}
                      className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {copiedId === note.id ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copiedId === note.id ? "Copied" : "Copy"}
                    </button>
                    {!note.isExisting && (
                      <button
                        type="button"
                        onClick={() => removeNote(note.id)}
                        className="rounded border border-border p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        aria-label="Remove note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="flex flex-col gap-2 pl-5">
                    {note.orderedSections.map(([heading, content]) => {
                      const sectionCopyKey = `${note.id}:${heading}`;
                      return (
                        <div key={heading} className="relative rounded-md border border-border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => void copySectionWithHeading(note.id, heading, content)}
                              title={`Copy "${heading}" with content`}
                              className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                            >
                              {heading}
                            </button>
                            <button
                              type="button"
                              onClick={() => void copySection(note.id, heading, content)}
                              title={`Copy "${heading}" content only`}
                              className="shrink-0 rounded border border-border p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              {copiedSection === sectionCopyKey ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                            {content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

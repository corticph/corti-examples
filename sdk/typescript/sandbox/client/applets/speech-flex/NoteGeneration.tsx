/**
 * NoteGeneration — template selection and document generation.
 *
 * The source selector controls what feeds the note:
 *   - **Combined** — per-section source control. A table shows each template
 *     section with three independent toggles: Dictation (verbatim, routed by
 *     the dictationRouter agent), Ambient (transcript context), and Facts.
 *     Default: Ambient on, Dictation and Facts off. Dictation-only → that
 *     section is filled with dictated text verbatim. Dictation + Ambient/Facts
 *     → a merge agent combines the AI-generated content with the dictated
 *     text (dictation appears verbatim; AI content fills the gaps). All three
 *     OFF → omitted.
 *   - **Interaction** — `interactionId` path: the SDK pulls persisted
 *     transcript + facts server-side. Requires a selected visit.
 *   - **Dictation only** — explicit `context` with just the editor text.
 *   - **Ambient only** — explicit `context` with just transcript segments.
 *   - **Facts only** — explicit `context` with just non-discarded facts.
 *
 * In Combined mode, the AI context includes the dictated text only when at
 * least one section has Dictation checked. Ambient/facts are included when
 * any AI or merge section requests them.
 *
 * Existing notes persisted on the interaction are fetched by the parent
 * (`SpeechFlex`) and passed as the `existingNotes` prop. This component does
 * not manage any fetch lifecycle — it only renders existing notes alongside
 * newly generated ones.
 *
 *
 * The template defaults to a per-user preference stored in localStorage, with
 * the ability to select an alternate template at generation time. The
 * template list is filtered by the *output* language: generic templates
 * (empty `languages` — no language-specific tweaks, including the Corti
 * standard ones) are offered for every language, alongside any templates
 * tweaked for the same primary language.
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
import { useEffect, useRef, useState } from "react";
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
import { describeAgentError } from "../_shared/cortiAgent";
import type { DiarizedSegment } from "../_shared/diarizedTranscript";
import type { CortiSdkEnvironment } from "../_shared/useCortiAccessToken";
import { cn } from "../_shared/utils";
import type { MergeSection } from "./dictationMerger";
import { mergeDictationWithGenerated } from "./dictationMerger";
import { routeDictationToSections } from "./dictationRouter";
import { Badge, Button, Callout, Card, CardHeader } from "./kit";
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

/** A section from the template's published version. */
interface TemplateSection {
  id: string;
  name: string;
  heading: string;
}

/** Per-section source selection in Combined mode. */
interface SectionSources {
  dictation: boolean;
  ambient: boolean;
  facts: boolean;
}

/** Default: Ambient on, Dictation and Facts off. */
const DEFAULT_SECTION_SOURCES: SectionSources = {
  dictation: false,
  ambient: true,
  facts: false,
};

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
  documentSource = "transcript",
  factsEnabled = true,
  showInteractionSource = false,
  getFacts,
  getSegments,
  existingNotes,
  onNoteGenerated,
  onSourceChange,
}: {
  authConfig: CortiAuth.AuthTokenDerivable;
  sdkEnvironment: CortiSdkEnvironment;
  /** Validated SDK client from the parent (gated by isReady). Null when auth isn't ready. */
  client: CortiClient | null;
  /** Set when a visit is selected. Used for the "interaction" source path. */
  interactionId: string | null;
  /** Editor text — always available, used by "combined" and "text" paths. */
  text: string;
  /** BCP 47 tag from the dictation/ambient language selector — seeds the initial output language. */
  spokenLanguage: string;
  /** Keywords to auto-select a sensible default template (e.g. ["soap"]). */
  defaultTemplateKeywords: string[];
  /** Which context source(s) to use for generation. */
  documentSource?: DocumentSource;
  /** Whether facts extraction is enabled in settings. Hides facts-related options when off. */
  factsEnabled?: boolean;
  /** Whether the "Interaction (server-side)" source option is shown. */
  showInteractionSource?: boolean;
  /** Getter for live facts. */
  getFacts?: () => Corti.StreamFact[];
  /** Getter for live transcript segments. */
  getSegments?: () => DiarizedSegment[];
  /** Notes persisted on the interaction, fetched by the parent. */
  existingNotes: ExistingNote[];
  /** Called when a note is generated, with the persisted document ID (if available). */
  onNoteGenerated?: (documentId: string) => void;
  /** Called when the user changes the source dropdown, so the parent can persist it. */
  onSourceChange?: (source: DocumentSource) => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [manualTemplateId, setManualTemplateId] = useState("");
  const [language, setLanguage] = useState(spokenLanguage);
  const { templates, loading: templatesLoading } = useGuidedTemplates(
    authConfig,
    sdkEnvironment,
    language,
  );
  const [source, setSource] = useState<DocumentSource>(documentSource);
  const [generatedNotes, setGeneratedNotes] = useState<GeneratedNote[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Dictated sentences the router agent placed in no verbatim section. */
  const [unallocatedSentences, setUnallocatedSentences] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Template section overview + per-section source selection (Combined mode).
  const [templateSections, setTemplateSections] = useState<TemplateSection[]>([]);
  const [sectionSources, setSectionSources] = useState<Map<string, SectionSources>>(new Map());
  const [fetchingSections, setFetchingSections] = useState(false);
  const [sectionsError, setSectionsError] = useState<string | null>(null);

  // Fall back to "combined" if the selected source is no longer available
  // (e.g. interaction hidden in settings or facts disabled).
  const activeSource =
    source === "interaction" && !showInteractionSource
      ? "combined"
      : source === "facts" && !factsEnabled
        ? "combined"
        : source;

  // Sync `source` to the fallback so the dropdown is honest about what's
  // selected, and persist the change. Without this, `source` would stay
  // "interaction" under the hood while the dropdown shows "combined" — and
  // re-enabling interaction would cause a surprise jump back.
  useEffect(() => {
    if (source !== activeSource) {
      setSource(activeSource);
      onSourceChange?.(activeSource);
    }
  }, [activeSource, source, onSourceChange]);

  // Deduplicate by name; the hook already narrowed the list to templates
  // that support the selected output language.
  const filteredTemplates = deduplicateTemplates(templates);

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
    setUnallocatedSentences([]);
  }, [interactionId]);

  // Merge existing (server-fetched) notes with session-generated notes.
  // Existing notes are rendered first (oldest), generated notes prepended (newest).
  const allNotes: GeneratedNote[] = [
    ...generatedNotes,
    ...existingNotes.map((n): GeneratedNote => ({ ...n, isExisting: true })),
  ];

  const effectiveTemplateId = templateId || manualTemplateId.trim();

  // Fetch the full template (with sections) when a template is selected.
  // The list endpoint doesn't include publishedVersion — only GET does.
  // We use a ref for the client to avoid an infinite loop: the CortiClient
  // is recreated when authConfig changes (e.g. token refresh), which would
  // re-trigger this effect on every render.
  const clientRef = useRef(client);
  clientRef.current = client;

  useEffect(() => {
    const c = clientRef.current;
    if (!c || !effectiveTemplateId) {
      setTemplateSections([]);
      setSectionSources(new Map());
      return;
    }
    let cancelled = false;
    setFetchingSections(true);
    setSectionsError(null);
    c.documents.templates
      .get(effectiveTemplateId)
      .then((t) => {
        if (cancelled) {
          return;
        }
        const sections = t.publishedVersion?.generation?.sections ?? [];
        setTemplateSections(
          sections.map((s) => ({
            id: s.id,
            name: s.name,
            heading: s.publishedVersion?.generation?.heading ?? s.name,
          })),
        );
        setSectionSources(new Map(sections.map((s) => [s.id, { ...DEFAULT_SECTION_SOURCES }])));
      })
      .catch((e) => {
        if (cancelled) {
          return;
        }
        setSectionsError(describeDocumentsError(e));
        setTemplateSections([]);
      })
      .finally(() => {
        if (!cancelled) {
          setFetchingSections(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- client accessed via ref to avoid re-fetch loop
  }, [effectiveTemplateId]);

  // Determine whether there's enough context to generate, based on the source.
  const hasContext = (() => {
    switch (activeSource) {
      case "combined": {
        const hasText = text.trim().length > 0;
        const hasSegs = (getSegments?.() ?? []).length > 0;
        const hasFacts = (getFacts?.() ?? []).some((f) => !f.isDiscarded);
        return hasText || hasSegs || hasFacts;
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

  // Whether the per-section source table should be shown — only in Combined mode.
  const showSectionSources = activeSource === "combined" && templateSections.length > 0;

  const generate = async () => {
    if (!canGenerate || generating || !client) {
      return;
    }
    setGenerating(true);
    setError(null);
    setUnallocatedSentences([]);
    try {
      const templateName =
        filteredTemplates.find((t) => t.id === effectiveTemplateId)?.name ?? "Custom template";

      const plainTemplateRef: Corti.GuidedTemplateRef = {
        templateId: effectiveTemplateId,
      };

      // --- Build a transcript context block from live segments ---
      const buildTranscriptContext = (): Corti.GuidedDocumentContext | null => {
        const segments = getSegments?.() ?? [];
        if (segments.length === 0) {
          return null;
        }
        return {
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
        };
      };

      // --- Build a facts context block from non-discarded facts ---
      const buildFactsContext = (): Corti.GuidedDocumentContext[] => {
        const facts = (getFacts?.() ?? []).filter((f) => !f.isDiscarded);
        return facts.map((f) => ({
          type: "facts",
          facts: [{ text: f.text, group: f.group }],
        }));
      };

      let result: Corti.GuidedDocumentsCreateEphemeralResponse;

      if (activeSource === "combined" && templateSections.length > 0) {
        // --- Combined mode: per-section source control ---
        //
        // Three kinds of sections:
        //   - **Merge** (Dictation + Ambient and/or Facts): AI generates from
        //     ambient/facts, then a merge agent combines the AI output with
        //     the routed dictated sentences. If the dictation covers
        //     everything, only dictation is kept; if partial, the agent weaves
        //     them together with the dictated text verbatim.
        //   - **Verbatim-only** (Dictation, no Ambient/Facts): filled with
        //     dictated text verbatim only. Excluded from AI generation.
        //   - **AI-only** (no Dictation, Ambient and/or Facts): AI-generated
        //     from ambient/facts as normal.
        //
        // The AI context always includes the dictation text (so the AI has
        // the full picture even for sections it generates from ambient or
        // facts). Ambient/facts are included when any AI or merge section
        // requests them.

        const mergeSections = templateSections.filter((s) => {
          const src = sectionSources.get(s.id);
          return !!src && src.dictation && (src.ambient || src.facts);
        });
        const verbatimOnlySections = templateSections.filter((s) => {
          const src = sectionSources.get(s.id);
          return !!src && src.dictation && !src.ambient && !src.facts;
        });
        const aiOnlySections = templateSections.filter((s) => {
          const src = sectionSources.get(s.id);
          return !!src && !src.dictation && (src.ambient || src.facts);
        });

        // Sections excluded from the note entirely (all three OFF).
        const allOffSections = templateSections.filter((s) => {
          const src = sectionSources.get(s.id);
          return !src || (!src.dictation && !src.ambient && !src.facts);
        });

        // Sections included in AI generation (merge + AI-only).
        const aiGeneratedSections = [...mergeSections, ...aiOnlySections];

        // Should ambient / facts be in the AI context?
        const includeAmbient = aiGeneratedSections.some((s) => sectionSources.get(s.id)?.ambient);
        const includeFacts = aiGeneratedSections.some((s) => sectionSources.get(s.id)?.facts);

        // Route dictation to merge + verbatim-only sections.
        const routingTargets = [...mergeSections, ...verbatimOnlySections];
        let routedMap = new Map<string, string>();
        if (routingTargets.length > 0 && text.trim()) {
          try {
            const routing = await routeDictationToSections({
              client,
              dictationText: text,
              targetSections: routingTargets.map((s) => ({
                id: s.id,
                heading: s.heading,
                name: s.name,
              })),
            });
            routedMap = routing.routed;
            // If the router placed no sentence anywhere, the classification
            // failed — apply the same fallback as an agent error: fill the
            // dictation sections with the full dictation so dictated text
            // never silently vanishes from the note.
            const placed = routingTargets.some((s) => (routing.routed.get(s.id) ?? "").length > 0);
            if (!placed) {
              for (const s of routingTargets) {
                routedMap.set(s.id, text.trim());
              }
              setError(
                "The routing agent placed no sentences in any Dictation section — filled them with the full dictation as a fallback.",
              );
            } else if (routing.unallocated.length > 0) {
              setUnallocatedSentences(routing.unallocated);
            }
          } catch (e) {
            for (const s of routingTargets) {
              routedMap.set(s.id, text.trim());
            }
            setError(
              `Couldn't route dictation to verbatim sections — ${describeAgentError(e)}. Filled them with the full dictation as a fallback.`,
            );
          }
        }

        // Build the AI context. Dictation text is only included when at least
        // one section has Dictation checked — if the user left Dictation off
        // for every section, they don't want the dictated text influencing
        // the AI-generated content.
        const includeDictation = routingTargets.length > 0;
        const buildCombinedContext = (): Corti.GuidedDocumentContext[] => {
          const context: Corti.GuidedDocumentContext[] = [];
          if (includeDictation && text.trim()) {
            context.push({ type: "text", text });
          }
          if (includeAmbient) {
            const tc = buildTranscriptContext();
            if (tc) {
              context.push(tc);
            }
          }
          if (includeFacts) {
            context.push(...buildFactsContext());
          }
          return context;
        };

        if (aiGeneratedSections.length === 0) {
          // All sections are verbatim-only — no API call.
          result = {
            document: {
              stringDocument: {},
              sections: [],
            } as unknown as Corti.GuidedEphemeralDocument,
            usageInfo: { creditsConsumed: 0 },
          } as unknown as Corti.GuidedDocumentsCreateEphemeralResponse;
        } else if (verbatimOnlySections.length > 0 || allOffSections.length > 0) {
          // Assembly: generate only the AI sections (merge + AI-only),
          // excluding verbatim-only and all-off sections.
          const assemblyTemplate: Corti.GuidedAssemblyRequest = {
            name: `${templateName} (filtered)`,
            sectionRefs: aiGeneratedSections.map((s) => ({
              sectionId: s.id,
            })),
          };
          result = await client.documents.generate({
            outputLanguage: language,
            assemblyTemplate,
            context: buildCombinedContext(),
          });
        } else {
          // No excluded sections — standard call with full template.
          result = await client.documents.generate({
            outputLanguage: language,
            templateRef: plainTemplateRef,
            context: buildCombinedContext(),
          });
        }

        const doc = result.document as GeneratedDocument;

        // Build a map of sectionId → [heading, content] from the AI output.
        const generatedMap = new Map<string, [string, string]>();
        if (doc.sections) {
          for (const s of doc.sections) {
            const content = doc.stringDocument[s.sectionId] ?? "";
            if (content.length > 0) {
              generatedMap.set(s.sectionId, [s.heading, content]);
            }
          }
        }

        // For merge sections, call the merge agent to combine dictated text
        // with AI-generated content. Only merge sections that have BOTH
        // routed dictation AND AI content are worth merging; the rest fall
        // back to whichever they have.
        let mergedMap = new Map<string, string>();
        const sectionsToMerge: MergeSection[] = [];
        for (const s of mergeSections) {
          const routed = routedMap.get(s.id) ?? "";
          const aiContent = generatedMap.get(s.id)?.[1] ?? "";
          if (routed.trim() && aiContent.trim()) {
            sectionsToMerge.push({
              id: s.id,
              heading: s.heading,
              dictatedText: routed,
              aiContent,
            });
          }
        }
        if (sectionsToMerge.length > 0) {
          try {
            const mergeResult = await mergeDictationWithGenerated({
              client,
              sections: sectionsToMerge,
            });
            mergedMap = mergeResult.merged;
          } catch (e) {
            // Fall back to concatenation for all merge sections.
            for (const s of sectionsToMerge) {
              mergedMap.set(s.id, `${s.dictatedText}\n${s.aiContent}`);
            }
            setError(
              `Couldn't merge dictation with AI content — ${describeAgentError(e)}. Concatenated them as a fallback.`,
            );
          }
        }

        // Assemble the final note in template order.
        const orderedSections = templateSections
          .map((ts): [string, string] | null => {
            const src = sectionSources.get(ts.id);
            if (!src || (!src.dictation && !src.ambient && !src.facts)) {
              return null; // all-off section: omit
            }

            // Merge section: use merged result if available.
            const merged = mergedMap.get(ts.id);
            if (merged != null) {
              return [ts.heading, merged];
            }

            // AI-generated section (merge section without merge result, or
            // AI-only section): use the AI output.
            const generated = generatedMap.get(ts.id);
            if (generated) {
              return generated;
            }

            // Verbatim-only section (or merge section with no AI content):
            // use routed dictation.
            if (src.dictation) {
              const routed = routedMap.get(ts.id);
              if (routed != null && routed.length > 0) {
                return [ts.heading, routed];
              }
            }

            return null;
          })
          .filter((s): s is [string, string] => s !== null);

        const mergeCount = mergeSections.length;
        const verbatimOnlyCount = verbatimOnlySections.length;
        const labelParts: string[] = [];
        if (mergeCount > 0) {
          labelParts.push(`${mergeCount} merged`);
        }
        if (verbatimOnlyCount > 0) {
          labelParts.push(`${verbatimOnlyCount} verbatim`);
        }
        const note: GeneratedNote = {
          id: doc.id ?? crypto.randomUUID(),
          templateName:
            labelParts.length > 0 ? `${templateName} (${labelParts.join(", ")})` : templateName,
          createdAt: Date.now(),
          orderedSections,
          creditsConsumed: result.usageInfo?.creditsConsumed ?? 0,
        };
        setGeneratedNotes((prev) => [note, ...prev]);
        if (doc.id) {
          onNoteGenerated?.(doc.id);
        }
      } else if (activeSource === "text" && templateSections.length > 0) {
        // --- Dictation only ---
        // Route dictated sentences to all template sections verbatim — no AI
        // generation. Same routing as Combined with Dictation on for all
        // sections, but without the per-section toggle UI.
        let routedMap = new Map<string, string>();
        if (text.trim()) {
          try {
            const routing = await routeDictationToSections({
              client,
              dictationText: text,
              targetSections: templateSections.map((s) => ({
                id: s.id,
                heading: s.heading,
                name: s.name,
              })),
            });
            routedMap = routing.routed;
            // Router placed nothing anywhere — classification failure, same
            // fallback as an agent error: every section gets the full dictation
            // instead of silently vanishing.
            const placed = templateSections.some(
              (s) => (routing.routed.get(s.id) ?? "").length > 0,
            );
            if (!placed) {
              for (const s of templateSections) {
                routedMap.set(s.id, text.trim());
              }
              setError(
                "The routing agent placed no sentences in any section — filled them with the full dictation as a fallback.",
              );
            } else if (routing.unallocated.length > 0) {
              setUnallocatedSentences(routing.unallocated);
            }
          } catch (e) {
            for (const s of templateSections) {
              routedMap.set(s.id, text.trim());
            }
            setError(
              `Couldn't route dictation to sections — ${describeAgentError(e)}. Filled them with the full dictation as a fallback.`,
            );
          }
        }

        const orderedSections = templateSections
          .map((ts): [string, string] | null => {
            const routed = routedMap.get(ts.id);
            if (routed != null && routed.length > 0) {
              return [ts.heading, routed];
            }
            return null;
          })
          .filter((s): s is [string, string] => s !== null);

        const note: GeneratedNote = {
          id: crypto.randomUUID(),
          templateName: `${templateName} (verbatim dictation)`,
          createdAt: Date.now(),
          orderedSections,
          creditsConsumed: 0,
        };
        setGeneratedNotes((prev) => [note, ...prev]);
      } else {
        // --- Non-Combined sources (interaction / ambient only / facts only) ---
        // Also handles the edge case where "combined" or "text" was selected
        // but templateSections haven't loaded yet — fall back to full-template
        // generation with dictation text as context.
        let context: Corti.GuidedDocumentContext[];
        if (activeSource === "interaction") {
          context = [];
        } else if (activeSource === "text" || activeSource === "combined") {
          context = text.trim() ? [{ type: "text", text }] : [];
        } else if (activeSource === "transcript") {
          const tc = buildTranscriptContext();
          context = tc ? [tc] : [];
        } else {
          // facts
          context = buildFactsContext();
        }

        if (activeSource === "interaction" && interactionId) {
          result = await client.documents.generate({
            outputLanguage: language,
            interactionId,
            templateRef: plainTemplateRef,
          });
        } else {
          result = await client.documents.generate({
            outputLanguage: language,
            templateRef: plainTemplateRef,
            context,
          });
        }

        const doc = result.document as GeneratedDocument;
        const orderedSections = extractOrderedSections(doc);

        const note: GeneratedNote = {
          id: doc.id ?? crypto.randomUUID(),
          templateName,
          createdAt: Date.now(),
          orderedSections,
          creditsConsumed: result.usageInfo?.creditsConsumed ?? 0,
        };
        setGeneratedNotes((prev) => [note, ...prev]);
        if (doc.id) {
          onNoteGenerated?.(doc.id);
        }
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
    <Card className="flex min-w-0 flex-col">
      <CardHeader
        icon={FileText}
        title="Note generation"
        meta={
          allNotes.length > 0
            ? `${allNotes.length} note${allNotes.length > 1 ? "s" : ""}`
            : undefined
        }
      />
      <div className="flex flex-col gap-3 px-4 py-3.5">
        {/* Template + language + source selectors */}
        <div className="flex flex-col gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Template</Label>
            {filteredTemplates.length > 0 ? (
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="h-8 rounded-[5px] text-[13px]">
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
                className="h-8 rounded-[5px] text-[13px]"
              />
            )}
          </div>

          {/* Output language */}
          <div className="space-y-1.5">
            <Label className="text-xs">Output language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="h-8 rounded-[5px] text-[13px]">
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

          {/* Source */}
          <div className="space-y-1.5">
            <Label className="text-xs">Source</Label>
            <Select
              value={activeSource}
              onValueChange={(v) => {
                const next = v as DocumentSource;
                setSource(next);
                onSourceChange?.(next);
              }}
            >
              <SelectTrigger className="h-8 rounded-[5px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="combined">Combined</SelectItem>
                {showInteractionSource && (
                  <SelectItem value="interaction">Interaction (server-side)</SelectItem>
                )}
                <SelectItem value="text">Dictation only</SelectItem>
                <SelectItem value="transcript">Ambient only</SelectItem>
                {factsEnabled && <SelectItem value="facts">Facts only</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {/* Per-section source table — only in Combined mode */}
          {fetchingSections && showSectionSources && (
            <p className="text-[11px] text-muted-foreground">Loading template sections…</p>
          )}
          {sectionsError && <p className="text-[11px] text-variant-error-text">{sectionsError}</p>}
          {showSectionSources && !fetchingSections && (
            <div className="space-y-1.5">
              <Label className="text-xs">Sections</Label>
              {/* Header row */}
              <div
                className={cn(
                  "grid items-center gap-1.5 px-1",
                  factsEnabled ? "grid-cols-[1fr_3rem_3rem_3rem]" : "grid-cols-[1fr_3rem_3rem]",
                )}
              >
                <span className="text-[11px] font-medium text-muted-foreground" />
                <span className="text-center text-[11px] font-medium text-muted-foreground">
                  Dict.
                </span>
                <span className="text-center text-[11px] font-medium text-muted-foreground">
                  Amb.
                </span>
                {factsEnabled && (
                  <span className="text-center text-[11px] font-medium text-muted-foreground">
                    Facts
                  </span>
                )}
              </div>
              {/* Section rows */}
              <div className="flex flex-col gap-0.5">
                {templateSections.map((s) => {
                  const src = sectionSources.get(s.id) ?? DEFAULT_SECTION_SOURCES;
                  // Read the live value from `prev` inside the updater, not the
                  // render-time snapshot in `src` — rapid toggles before a
                  // re-render would otherwise be based on stale state and drop
                  // clicks.
                  const toggle = (key: keyof SectionSources) =>
                    setSectionSources((prev) => {
                      const current = prev.get(s.id) ?? DEFAULT_SECTION_SOURCES;
                      const next = new Map(prev);
                      next.set(s.id, {
                        ...current,
                        [key]: !current[key],
                      });
                      return next;
                    });
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "grid items-center gap-1.5 px-1 py-0.5",
                        factsEnabled
                          ? "grid-cols-[1fr_3rem_3rem_3rem]"
                          : "grid-cols-[1fr_3rem_3rem]",
                      )}
                    >
                      <span className="truncate text-[12px] text-foreground" title={s.heading}>
                        {s.heading}
                      </span>
                      {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps the Checkbox control */}
                      <label className="flex justify-center">
                        <Checkbox
                          checked={src.dictation}
                          onCheckedChange={() => toggle("dictation")}
                        />
                      </label>
                      {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps the Checkbox control */}
                      <label className="flex justify-center">
                        <Checkbox checked={src.ambient} onCheckedChange={() => toggle("ambient")} />
                      </label>
                      {factsEnabled && (
                        /* biome-ignore lint/a11y/noLabelWithoutControl: label wraps the Checkbox control */
                        <label className="flex justify-center">
                          <Checkbox checked={src.facts} onCheckedChange={() => toggle("facts")} />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Dictation routes your dictated sentences into the section verbatim. Ambient
                {factsEnabled ? " and Facts" : ""} have the AI generate from those sources. Both on:
                an agent merges them, keeping dictation verbatim.
              </p>
            </div>
          )}
        </div>

        {/* Generate button */}
        <div className="flex flex-col gap-2.5">
          <Button
            type="button"
            onClick={() => void generate()}
            disabled={generating || !canGenerate}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {generating ? "Generating…" : "Generate note"}
          </Button>
        </div>

        {error && (
          <Callout tone="error" icon={FileText}>
            {error}
          </Callout>
        )}

        {/* Dictated sentences the router placed in no Dictation section.
            Not lost — they still feed the AI via context — but surfaced so the
            clinician can see what didn't get a verbatim home. */}
        {unallocatedSentences.length > 0 && (
          <div className="rounded-[5px] border border-border bg-muted/40 p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              {unallocatedSentences.length} sentence
              {unallocatedSentences.length > 1 ? "s" : ""} from the dictation weren&apos;t placed in
              any Dictation section:
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[12px] italic leading-relaxed text-muted-foreground">
              {unallocatedSentences.join(" ")}
            </p>
          </div>
        )}

        {/* Notes (existing + generated) */}
        {allNotes.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {allNotes.map((note) => {
              const isExpanded = expandedId === note.id;
              return (
                <div
                  key={note.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-md border border-border bg-background p-3",
                    !note.isExisting && "animate-rise",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : note.id)}
                      className="flex min-w-0 items-center gap-2 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {note.templateName}
                      </span>
                      {note.isExisting && <Badge tone="neutral">Saved</Badge>}
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {new Date(note.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">
                        {note.creditsConsumed} cr
                      </span>
                    </button>
                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => void copyNote(note)}
                        className="h-6 px-2 text-[11px]"
                      >
                        {copiedId === note.id ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copiedId === note.id ? "Copied" : "Copy"}
                      </Button>
                      {!note.isExisting && (
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => removeNote(note.id)}
                          className="h-6 w-6 px-0"
                          aria-label="Remove note"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="flex flex-col gap-2 pl-5">
                      {note.orderedSections.map(([heading, content]) => {
                        const sectionCopyKey = `${note.id}:${heading}`;
                        return (
                          <div
                            key={heading}
                            className="relative rounded-md border border-border p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void copySectionWithHeading(note.id, heading, content)
                                }
                                title={`Copy "${heading}" with content`}
                                className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:text-foreground"
                              >
                                {heading}
                              </button>
                              <Button
                                variant="ghost"
                                type="button"
                                onClick={() => void copySection(note.id, heading, content)}
                                title={`Copy "${heading}" content only`}
                                className="shrink-0 p-1"
                              >
                                {copiedSection === sectionCopyKey ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
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

        {/* Generation progress — thin flowing bar, pinned to the card bottom */}
        {generating && <div className="mx-3.5 mb-1 h-0.5 animate-flow rounded-full" />}
      </div>
    </Card>
  );
}

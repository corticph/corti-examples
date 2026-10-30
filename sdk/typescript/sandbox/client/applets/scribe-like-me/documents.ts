/**
 * Guided Documents helpers for Scribe Like Me: discover candidate Corti
 * Standard templates (with their resolved sections), and generate a note
 * either plain (out-of-the-box) or tailored via runtime `templateRef.overrides`
 * — Corti's "Path 2" pattern, documented as the recommended way to do
 * per-clinician customization without maintaining a template per user.
 *
 * This extends the Guided-documents surface already sketched in
 * `_shared/corti-documents.ts` (which only covers plain, override-free
 * generation) with the override-capable call this applet needs.
 */
import type { Corti, CortiClient } from "@corti/sdk";
import { type CandidateTemplate, summarizeOutputShape } from "./agent";
import type { StyleProfile } from "./personaStore";

/** Name keywords that make a Corti Standard template a good fit for a general
 * ambulatory encounter note — used only to rank the shortlist we hand the
 * Template Tailor agent, not as a hard filter. */
const PREFERRED_KEYWORDS = ["soap", "brief", "progress", "consultation", "clinical note"];

/** Fetch a short list of candidate Corti Standard template ids/names, ranked
 * by relevance to a general ambulatory note. */
export async function listCandidateTemplateRefs(
  client: CortiClient,
  max = 6,
): Promise<Array<{ id: string; name: string }>> {
  const templates = await client.documents.templates.list({
    source: "corti",
    lang: ["en"],
  });
  const ranked = [...templates].sort((a, b) => {
    const scoreA = PREFERRED_KEYWORDS.some((k) => a.name.toLowerCase().includes(k)) ? 1 : 0;
    const scoreB = PREFERRED_KEYWORDS.some((k) => b.name.toLowerCase().includes(k)) ? 1 : 0;
    return scoreB - scoreA;
  });
  return ranked.slice(0, max).map((t) => ({ id: t.id, name: t.name }));
}

/** Resolve one template's id/name plus its fully-expanded sections (heading +
 * default instructions per section) into the shape the Template Tailor agent
 * consumes. */
export async function resolveCandidateTemplate(
  client: CortiClient,
  templateId: string,
): Promise<CandidateTemplate> {
  const template = await client.documents.templates.get(templateId);
  const sections = template.publishedVersion?.generation.sections ?? [];
  return {
    templateId: template.id,
    templateName: template.name,
    sections: sections.map((s) => {
      const family = s.labels?.find((l) => l.key === "family")?.value;
      const gen = s.publishedVersion?.generation;
      return {
        sectionId: s.id,
        family,
        heading: gen?.heading ?? s.name,
        contentPrompt: gen?.instructions?.contentPrompt ?? "",
        writingStylePrompt: gen?.instructions?.writingStylePrompt ?? "",
        miscPrompt: gen?.instructions?.miscPrompt ?? "",
        outputShape: summarizeOutputShape(gen?.outputSchema),
      };
    }),
  };
}

/** Fetch and fully resolve a shortlist of candidate templates in one call. */
export async function fetchCandidateTemplates(
  client: CortiClient,
  max = 6,
): Promise<CandidateTemplate[]> {
  const refs = await listCandidateTemplateRefs(client, max);
  return Promise.all(refs.map((r) => resolveCandidateTemplate(client, r.id)));
}

function buildOverrides(profile: StyleProfile): Corti.GuidedTemplateOverrides | undefined {
  const sections: Corti.GuidedSectionOverride[] = [];
  for (const s of profile.sections) {
    const instructions: Corti.GuidedSectionInstructionsOverride = {};
    if (s.contentPromptOverride) {
      instructions.contentPrompt = s.contentPromptOverride;
    }
    if (s.writingStylePromptOverride) {
      instructions.writingStylePrompt = s.writingStylePromptOverride;
    }
    const generation: Corti.GuidedSectionOverrides = {};
    if (s.headingOverride) {
      generation.heading = s.headingOverride;
    }
    if (Object.keys(instructions).length > 0) {
      generation.instructions = instructions;
    }
    if (Object.keys(generation).length > 0) {
      sections.push({ sectionId: s.sectionId, generation });
    }
  }
  const hasTemplatePrompt = Boolean(profile.templatePromptOverride);
  if (!hasTemplatePrompt && sections.length === 0) {
    return undefined;
  }
  return {
    ...(hasTemplatePrompt
      ? { instructions: { prompt: profile.templatePromptOverride as string } }
      : {}),
    ...(sections.length > 0 ? { sections } : {}),
  };
}

export interface GeneratedSection {
  sectionId: string;
  heading: string;
  text: string;
}

export interface GeneratedNote {
  sections: GeneratedSection[];
  creditsConsumed?: number;
}

/** Generate a note from a transcript against a persona's chosen template. When
 * `tailored` and a custom template has already been saved (see
 * `saveAsCustomTemplate`), generation targets that durable template directly
 * with no runtime overrides; otherwise tailoring falls back to Path 2
 * (`templateRef.overrides`). `tailored: false` always means the plain,
 * out-of-the-box baseline for side-by-side comparison. */
export async function generateNote(
  client: CortiClient,
  profile: StyleProfile,
  transcriptText: string,
  outputLanguage: string,
  tailored: boolean,
): Promise<GeneratedNote> {
  const customTemplate = tailored ? profile.customTemplate : null;
  const templateId = customTemplate?.templateId ?? profile.templateId;
  const overrides = tailored && !customTemplate ? buildOverrides(profile) : undefined;
  const result = await client.documents.generate({
    outputLanguage,
    templateRef: {
      templateId,
      ...(overrides ? { overrides } : {}),
    },
    context: [{ type: "text", text: transcriptText }],
  });

  // Walk profile.sections (the template's own order, resolved with
  // inheritance when the candidate template was fetched) rather than
  // Object.entries(stringDocument) — key order on a parsed JSON object
  // reflects wire/serialization order, not the template's section sequence,
  // which is what made the rendered note read out of order. When generation
  // targeted a saved custom template, overridden sections come back keyed
  // by their *new* custom sectionId, not the original base id recorded on
  // the profile, so map through sectionIdMap to find them.
  const stringDocument = result.document.stringDocument;
  const seen = new Set<string>();
  const sections: GeneratedSection[] = [];
  for (const s of profile.sections) {
    const noteSectionId = customTemplate?.sectionIdMap[s.sectionId] ?? s.sectionId;
    if (!(noteSectionId in stringDocument)) {
      continue;
    }
    seen.add(noteSectionId);
    sections.push({
      sectionId: noteSectionId,
      heading: tailored ? (s.headingOverride ?? s.defaultHeading) : s.defaultHeading,
      text: stringDocument[noteSectionId],
    });
  }
  // Anything the API returned that wasn't already known (should be rare —
  // e.g. the template drifted from what profile.sections captured) is still
  // shown, just appended at the end rather than silently dropped.
  for (const [sectionId, text] of Object.entries(stringDocument)) {
    if (!seen.has(sectionId)) {
      sections.push({ sectionId, heading: sectionId, text });
    }
  }
  return { sections, creditsConsumed: result.usageInfo?.creditsConsumed };
}

// --------------------------------------------------------------------- //
// Persisting tailoring as a real, durable template (vs. runtime overrides)
// --------------------------------------------------------------------- //

interface CustomSectionPlan {
  /** Stable key used to thread a not-yet-created section through the
   * template payload; real values only exist after the section is created
   * (or, for the JSON export, never — the placeholder ships as-is). */
  placeholderId: string;
  baseSectionId: string;
  orderIndex: number;
  request: Corti.GuidedSectionsCreateFromInheritanceRequest;
}

/** Shared recipe for both `saveAsCustomTemplate` (calls the API) and
 * `buildCustomTemplateExport` (returns the same payloads as plain JSON):
 * one new Section per overridden section (inheriting everything not
 * overridden from the base section), plus a template request that
 * references those new sections alongside the untouched base ones, in the
 * original order. */
function buildCustomTemplatePlan(personaName: string, profile: StyleProfile) {
  const toCreate: CustomSectionPlan[] = [];
  const unchanged: Corti.GuidedTemplatesVersionSectionRequest[] = [];

  profile.sections.forEach((s, orderIndex) => {
    const hasOverride = Boolean(
      s.headingOverride || s.contentPromptOverride || s.writingStylePromptOverride,
    );
    if (!hasOverride) {
      unchanged.push({ sectionId: s.sectionId, orderIndex });
      return;
    }
    const instructions: Corti.GuidedSectionInstructionsPartial = {};
    if (s.contentPromptOverride) {
      instructions.contentPrompt = s.contentPromptOverride;
    }
    if (s.writingStylePromptOverride) {
      instructions.writingStylePrompt = s.writingStylePromptOverride;
    }
    const generation: Corti.GuidedSectionGenerationPartial = {};
    if (s.headingOverride) {
      generation.heading = s.headingOverride;
    }
    if (Object.keys(instructions).length > 0) {
      generation.instructions = instructions;
    }
    toCreate.push({
      placeholderId: `section-${orderIndex + 1}`,
      baseSectionId: s.sectionId,
      orderIndex,
      request: {
        name: `${personaName} — ${s.headingOverride ?? s.defaultHeading} (tailored)`,
        inheritFromId: s.sectionId,
        generation,
      },
    });
  });

  const buildTemplateRequest = (
    resolvedSectionIds: Record<string, string>,
  ): Corti.GuidedTemplatesCreateFromInheritanceRequest => ({
    name: `${personaName}'s ${profile.templateName}`,
    description: `Custom template tailored to ${personaName}'s documentation style — generated by the Scribe like me applet.`,
    inheritFromId: profile.templateId,
    generation: {
      ...(profile.templatePromptOverride
        ? { instructions: { prompt: profile.templatePromptOverride } }
        : {}),
      sections: [
        ...unchanged,
        ...toCreate.map((p) => ({
          sectionId: resolvedSectionIds[p.placeholderId] ?? p.baseSectionId,
          orderIndex: p.orderIndex,
        })),
      ].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
    },
  });

  return { toCreate, buildTemplateRequest };
}

export interface SavedCustomTemplate {
  templateId: string;
  templateName: string;
  sectionIdMap: Record<string, string>;
}

/** Materialize a persona's tailoring as real, persisted Corti resources: one
 * custom Section per overridden section (via `inheritFromId`, so anything
 * not touched keeps inheriting live from the base section), then one custom
 * Template referencing those new sections plus the untouched base ones, in
 * order. Unlike the runtime overrides used elsewhere in this applet, this
 * creates durable, versioned, listable tenant resources — visible in
 * `documents.templates.list()` like any other template. Sections are
 * created sequentially so a failure partway through is easy to reason
 * about (the ones already created are still valid resources; nothing is
 * rolled back). */
export async function saveAsCustomTemplate(
  client: CortiClient,
  personaName: string,
  profile: StyleProfile,
): Promise<SavedCustomTemplate> {
  const { toCreate, buildTemplateRequest } = buildCustomTemplatePlan(personaName, profile);
  const resolvedByPlaceholder: Record<string, string> = {};
  const sectionIdMap: Record<string, string> = {};
  for (const plan of toCreate) {
    const section = await client.documents.sections.create(plan.request);
    resolvedByPlaceholder[plan.placeholderId] = section.id;
    sectionIdMap[plan.baseSectionId] = section.id;
  }
  const template = await client.documents.templates.create(
    buildTemplateRequest(resolvedByPlaceholder),
  );
  return { templateId: template.id, templateName: template.name, sectionIdMap };
}

/** Same recipe as `saveAsCustomTemplate`, returned as plain request payloads
 * instead of calling the API — for downloading, inspecting, or transporting
 * to a different Corti project/tenant to create there instead. Since no
 * sections exist yet, the template payload references each not-yet-created
 * section by a placeholder id; the two-step recipe to actually create these
 * resources is spelled out in `_instructions`. */
export function buildCustomTemplateExport(personaName: string, profile: StyleProfile) {
  const { toCreate, buildTemplateRequest } = buildCustomTemplatePlan(personaName, profile);
  const placeholderIdentity = Object.fromEntries(
    toCreate.map((p) => [p.placeholderId, p.placeholderId]),
  );
  return {
    _instructions:
      "Two-step recipe to create this as real resources in any Corti project: " +
      "(1) POST each entry's `request` in `sectionsToCreate` to /documents/sections and note the returned `id`. " +
      "(2) In `template.generation.sections`, replace any `sectionId` that matches a `sectionsToCreate[].placeholderId` " +
      "with the real id from step 1, then POST `template` to /documents/templates.",
    sectionsToCreate: toCreate.map((p) => ({ placeholderId: p.placeholderId, request: p.request })),
    template: buildTemplateRequest(placeholderIdentity),
  };
}

/** Human-friendly error message with guidance for a 403 response. */
export function describeDocumentsError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/403|forbidden/i.test(message)) {
    return "Document generation failed (403). Verify the token scope, tenant, and environment.";
  }
  return message;
}

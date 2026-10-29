/**
 * Guided Documents helpers for My Note Style: resolve a template's sections
 * with their current prompts, generate a note (plain or with overrides built
 * from accumulated memory entries), and extract section-level text from the
 * response.
 *
 * The generation path mirrors scribe-like-me's "Path 2" pattern
 * (templateRef.overrides) — the base template is never mutated.
 */
import type { Corti, CortiClient } from "@corti/sdk";

export interface TemplateSection {
  sectionId: string;
  heading: string;
  contentPrompt: string;
  writingStylePrompt: string;
  miscPrompt: string;
}

export interface ResolvedTemplate {
  templateId: string;
  templateName: string;
  sections: TemplateSection[];
}

/** Name keywords that make a template a good fit for a general encounter note. */
const PREFERRED_KEYWORDS = [
  "soap",
  "brief",
  "progress",
  "consultation",
  "clinical note",
  "encounter",
];

/** Fetch a short ranked list of candidate template ids/names. */
export async function listCandidateTemplates(
  client: CortiClient,
  max = 8,
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

/** Resolve one template's full section definitions with current prompt values. */
export async function resolveTemplate(
  client: CortiClient,
  templateId: string,
): Promise<ResolvedTemplate> {
  const template = await client.documents.templates.get(templateId);
  const sections = template.publishedVersion?.generation.sections ?? [];
  return {
    templateId: template.id,
    templateName: template.name,
    sections: sections.map((s) => {
      const gen = s.publishedVersion?.generation;
      return {
        sectionId: s.id,
        heading: gen?.heading ?? s.name,
        contentPrompt: gen?.instructions?.contentPrompt ?? "",
        writingStylePrompt: gen?.instructions?.writingStylePrompt ?? "",
        miscPrompt: gen?.instructions?.miscPrompt ?? "",
      };
    }),
  };
}

/** Fetch and fully resolve the best-fit candidate template. */
export async function fetchDefaultTemplate(client: CortiClient): Promise<ResolvedTemplate | null> {
  const refs = await listCandidateTemplates(client, 1);
  if (refs.length === 0) {
    return null;
  }
  return resolveTemplate(client, refs[0].id);
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

/** Generate a note from text context. When overrides are provided, they are
 *  applied as runtime templateRef.overrides (Path 2). */
export async function generateNote(
  client: CortiClient,
  templateId: string,
  transcriptText: string,
  outputLanguage: string,
  overrides?: Corti.GuidedTemplateOverrides,
): Promise<GeneratedNote> {
  const result = await client.documents.generate({
    outputLanguage,
    templateRef: {
      templateId,
      ...(overrides ? { overrides } : {}),
    },
    context: [{ type: "text", text: transcriptText }],
  });

  const doc = result.document;
  const sections: GeneratedSection[] = [];

  // Use the document's sections array for ordering
  if (doc.sections && doc.sections.length > 0) {
    for (const s of doc.sections) {
      const text = doc.stringDocument[s.sectionId] ?? "";
      if (text.length > 0) {
        sections.push({
          sectionId: s.sectionId,
          heading: s.heading,
          text,
        });
      }
    }
  } else {
    for (const [sectionId, text] of Object.entries(doc.stringDocument)) {
      if (text.length > 0) {
        sections.push({ sectionId, heading: sectionId, text });
      }
    }
  }

  return {
    sections,
    creditsConsumed: result.usageInfo?.creditsConsumed,
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

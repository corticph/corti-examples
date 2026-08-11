import type { CortiClient } from "@corti/sdk";
import type { ExtractedFact } from "./extractFacts.js";

export interface GeneratedNote {
  name: string;
  sections: Array<{ key: string; name: string; text: string }>;
}

/**
 * Generates a structured clinical note (SOAP template) from extracted facts.
 *
 * Uses documents.create() with a built-in templateKey — the simplest note-generation path,
 * with no template/section setup required. It's marked deprecated in favor of
 * documents.generate(), which supports custom templates but requires creating (and cleaning
 * up) template/section resources first. See sdk/typescript/express-web-api's
 * guidedDocuments.ts route for that fuller, production-oriented flow.
 */
export async function generateNote(
  client: CortiClient,
  interactionId: string,
  facts: ExtractedFact[],
): Promise<GeneratedNote> {
  const document = await client.documents.create(interactionId, {
    context: [{ type: "facts", data: facts }],
    templateKey: "soap",
    outputLanguage: "en",
  });

  return {
    name: document.name,
    sections: document.sections.map((section) => ({
      key: section.key,
      name: section.name,
      text: section.text,
    })),
  };
}

import type { CortiClient } from "@corti/sdk";

export interface ExtractedFact {
  text: string;
  group?: string;
}

/**
 * Turns raw transcript text into discrete clinical facts (the same building block the
 * ambient note-generation flow uses downstream).
 */
export async function extractFacts(
  client: CortiClient,
  transcriptText: string,
): Promise<ExtractedFact[]> {
  const { facts } = await client.facts.extract({
    context: [{ type: "text", text: transcriptText }],
    outputLanguage: "en",
  });

  return facts.map((fact) => ({ text: fact.text, group: fact.group }));
}

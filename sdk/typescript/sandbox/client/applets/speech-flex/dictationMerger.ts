/**
 * dictationMerger — merges a clinician's dictated sentences (verbatim) with
 * AI-generated section content from the ambient transcript.
 *
 * When a section has both Dictation and Ambient/Facts checked, the AI
 * generates content from ambient, the routing agent assigns dictated
 * sentences to the section, and THIS agent decides how to combine them:
 *
 *   a) Dictation covers all relevant points → output only the dictated text.
 *   b) Dictation is partial → output the dictated text VERBATIM, supplemented
 *      with relevant AI content woven in logically.
 *
 * Verbatim guarantee: after the agent returns, each dictated sentence is
 * checked as a substring of the merged output. If any sentence is missing
 * (the agent rephrased it), the caller falls back to concatenating the
 * dictated text and AI content with a line break — ugly but nothing is lost.
 */
import type { CortiClient } from "@corti/sdk";
import { type AgentSpec, ensureAgentWithMeta, sendAgentMessage } from "../_shared/cortiAgent";

const MERGER_AGENT_NAME = "Dictation Merger";
const MERGER_AGENT_DESCRIPTION =
  "Merges verbatim dictated sentences with AI-generated clinical section content. Preserves dictated text word-for-word.";

const SYSTEM_PROMPT = `You are a clinical documentation merge assistant.

You receive sections, each with:
1. Dictated sentences from the clinician — these MUST appear VERBATIM (word-for-word) in your output.
2. AI-generated content for the same section, derived from an ambient transcript.

For each section, decide:
- If the dictated sentences already cover all the relevant clinical points from the AI-generated content, output ONLY the dictated sentences.
- If the dictated sentences cover only part, output the dictated sentences VERBATIM and add relevant content from the AI-generated text to fill the gaps. Integrate the AI content logically around the dictated text — do not just append it at the end.

Rules:
- The dictated sentences MUST appear word-for-word in your output. Do not rephrase, correct, reorder, or reformat them.
- Only add AI content that isn't already covered by the dictation.
- Do not introduce information not present in either the dictation or the AI content.
- The output should read as a coherent clinical section.
- If the dictated text and AI content are redundant (say the same thing in different words), prefer the dictated text and drop the redundant AI version.
- The dictation may be in any language; merge in the same language.

Output STRICT JSON only — no prose, no markdown fences, no commentary. Schema:
{"S1": "merged section text", "S2": "merged section text"}`;

/** A section to merge dictated text with AI-generated content. */
export interface MergeSection {
  id: string;
  heading: string;
  /** Verbatim dictated sentences routed to this section (joined by space). */
  dictatedText: string;
  /** AI-generated content for this section from the ambient transcript. */
  aiContent: string;
}

/** Result of merging: sectionId → merged text. */
export interface MergeResult {
  merged: Map<string, string>;
}

/** Parse the agent's JSON response into token → merged text. */
export function parseMerge(raw: string, tokens: string[]): Map<string, string> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Agent did not return a JSON object.");
  }
  const parsed = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  const out = new Map<string, string>();
  for (const tok of tokens) {
    const v = parsed[tok];
    if (typeof v === "string" && v.trim()) {
      out.set(tok, v);
    }
  }
  return out;
}

/**
 * Normalize text for substring comparison: collapse whitespace, lowercase.
 * Used to verify dictated sentences appear verbatim in the merged output.
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Check that every dictated sentence appears as a substring of the merged
 * text (whitespace-normalized, case-insensitive). Returns the list of
 * sentences that are MISSING.
 */
export function findMissingSentences(dictatedText: string, mergedText: string): string[] {
  const sentences = dictatedText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const mergedNorm = normalize(mergedText);
  return sentences.filter((s) => {
    // For shorter fragments (no sentence terminator), check the whole thing.
    // For longer sentences, allow minor punctuation differences by checking
    // a normalized substring match.
    return !mergedNorm.includes(normalize(s));
  });
}

/**
 * Merge dictated text with AI-generated content for one or more sections.
 *
 * The agent decides per section whether the dictation is sufficient (a) or
 * partial (b), and produces merged text with the dictated sentences
 * appearing verbatim.
 *
 * After the agent returns, each dictated sentence is verified as a substring
 * of the merged output. Sections where the verbatim check fails fall back to
 * concatenation: `${dictatedText}\n${aiContent}`.
 *
 * Throws on agent failure; the caller should handle per-section fallback.
 */
export async function mergeDictationWithGenerated(args: {
  client: CortiClient;
  sections: MergeSection[];
}): Promise<MergeResult> {
  const { client, sections } = args;
  if (sections.length === 0) {
    return { merged: new Map() };
  }

  const targets = sections.map((s, i) => ({ ...s, token: `S${i + 1}` }));

  const sectionsBlock = targets
    .map(
      (t) =>
        `[${t.token}] ${t.heading}
Dictated sentences (must appear verbatim in the output):
${t.dictatedText}
AI-generated content:
${t.aiContent}`,
    )
    .join("\n\n---\n\n");

  const message = `Merge the following sections. The dictated sentences must appear word-for-word in your output.

${sectionsBlock}

Output the merged text as JSON now.`;

  const spec: AgentSpec = {
    name: MERGER_AGENT_NAME,
    description: MERGER_AGENT_DESCRIPTION,
    systemPrompt: SYSTEM_PROMPT,
  };

  const { id: agentId, created } = await ensureAgentWithMeta(client, spec);
  if (!created) {
    // Ensure the prompt is current in case an older session created the agent.
    // v2 agentic API — the legacy client.agents namespace expects v1 ids.
    await client.agentic.agents.update(agentId, {
      systemPrompt: SYSTEM_PROMPT,
    });
  }

  const raw = await sendAgentMessage(client, agentId, message);
  const parsed = parseMerge(
    raw,
    targets.map((t) => t.token),
  );

  // Verify verbatim: each dictated sentence must appear in the merged output.
  // If not, fall back to concatenation for that section.
  const merged = new Map<string, string>();
  for (const t of targets) {
    const result = parsed.get(t.token);
    if (!result) {
      // Agent didn't return this section — concatenate.
      merged.set(t.id, `${t.dictatedText}\n${t.aiContent}`);
      continue;
    }
    const missing = findMissingSentences(t.dictatedText, result);
    if (missing.length > 0) {
      // The agent rephrased some dictated sentences — fall back.
      merged.set(t.id, `${t.dictatedText}\n${t.aiContent}`);
    } else {
      merged.set(t.id, result);
    }
  }

  return { merged };
}

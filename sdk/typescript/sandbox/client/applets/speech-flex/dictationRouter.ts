/**
 * dictationRouter — routes dictated sentences to the clinical note sections
 * that have Dictation checked, verbatim.
 *
 * The agent ONLY classifies sentence indices; it never rewrites text. The
 * caller splits the dictation into a numbered sentence list, the agent
 * returns which 1-based indices belong to each section, and the caller
 * reassembles the original sentences verbatim. Because the agent only ever
 * emits integer indices (never text), the words in each Dictation section
 * are guaranteed to be the clinician's exact dictation — the agent cannot
 * paraphrase.
 *
 * Sentences the agent doesn't assign to any Dictation section are returned
 * as `unallocated` so the caller can surface them. They are NOT placed in
 * any Dictation section; the caller still sends the full dictation as AI
 * context, so unallocated content is synthesized by the AI into the
 * AI-generated sections rather than appearing verbatim.
 */
import type { CortiClient } from "@corti/sdk";
import { type AgentSpec, ensureAgentWithMeta, sendAgentMessage } from "../_shared/cortiAgent";

const ROUTER_AGENT_NAME = "Dictation Router";
const ROUTER_AGENT_DESCRIPTION =
  "Routes dictated sentences to clinical note sections by index. Classification only; never rewrites text.";

const SYSTEM_PROMPT = `You are a clinical documentation routing assistant.

You will receive:
1. A list of clinical note sections to fill, each with a stable token in brackets (e.g. [S1]) and its heading.
2. A numbered list of sentences from a clinician's dictation.

Your ONLY job is to decide which dictation sentences belong to which section. You classify by 1-based sentence index. You do NOT write, edit, rephrase, correct, or reorder any text — the caller reassembles the original sentences verbatim.

Output STRICT JSON only — no prose, no markdown fences, no commentary. Schema:
{"S1": [1, 3], "S2": [5], "S3": [6, 7]}

Rules:
- Keys MUST be the exact tokens provided (e.g. "S1"). Quote each key.
- Values are arrays of 1-based sentence indices (integers) that belong to that section.
- A sentence index may appear in AT MOST ONE section. Sentences that don't clearly belong to any listed section must be omitted (do not invent sections or keys).
- If no sentences belong to a section, omit the key (or use an empty array).
- Assign by clinical meaning: history/symptoms/complaints/CC -> HPI/Subjective/History; exam/vitals/observations -> Objective/Physical exam/Exam; diagnoses/impressions/assessment -> Assessment/Impression; meds/orders/plan/follow-up/disposition -> Plan. Match the headings given.
- The dictation may be in any language; classify by meaning regardless of language.
- Do NOT include any sentence text in your output — only integer indices.`;

/** A Dictation section to route dictated sentences into. */
export interface RouteTarget {
  id: string;
  heading: string;
  name: string;
}

/** Result of routing: verbatim text per Dictation section + sentences placed nowhere. */
export interface RoutingResult {
  /** sectionId -> verbatim sentences joined by a space. */
  routed: Map<string, string>;
  /** Original sentences not assigned to any Dictation section. */
  unallocated: string[];
}

/** Abbreviations that should NOT be treated as sentence terminators. */
const PROTECTED_ABBREVS = [
  "Mr.",
  "Mrs.",
  "Ms.",
  "Dr.",
  "Prof.",
  "Pt.",
  "Pts.",
  "vs.",
  "mg.",
  "mcg.",
  "ml.",
  "kg.",
  "y.o.",
  "yo.",
  "a.m.",
  "p.m.",
  "e.g.",
  "i.e.",
  "etc.",
  "no.",
  "approx.",
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split dictated text into sentence-sized chunks. Newlines always separate
 * chunks; sentence terminators (. ! ?) followed by whitespace and an
 * uppercase letter, digit, or quote also separate. Common title/unit
 * abbreviations are protected so they don't cause false splits.
 *
 * Granularity only affects routing precision, never verbatim integrity —
 * the caller always reassembles from these exact chunks, so coarser splits
 * just mean a chunk routes wholesale to one section.
 */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  let work = trimmed;
  const stash: string[] = [];
  for (const ab of PROTECTED_ABBREVS) {
    const re = new RegExp(escapeRegex(ab), "g");
    work = work.replace(re, (m) => {
      const ph = `\u0001${stash.length}\u0001`;
      stash.push(m);
      return ph;
    });
  }
  const parts = work
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter(Boolean);
  // The \u0001 sentinels never occur in dictated text — they let the split
  // regex skip abbreviation dots without matching the stashed text itself.
  return parts.map((s) =>
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional placeholder sentinels
    s.replace(/\u0001(\d+)\u0001/g, (_, i) => stash[Number(i)] ?? ""),
  );
}

/** Parse the agent's JSON response into token -> indices. Only keeps keys
 *  that match a known token. Throws on missing/invalid JSON. */
export function parseRouting(raw: string, tokens: string[]): Map<string, number[]> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Agent did not return a JSON object.");
  }
  const parsed = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  const out = new Map<string, number[]>();
  for (const tok of tokens) {
    const v = parsed[tok];
    if (Array.isArray(v) && v.every((x) => typeof x === "number")) {
      out.set(tok, v as number[]);
    } else if (typeof v === "string" && v.trim()) {
      // Tolerate "1, 3" or "1 3" style.
      const nums = v
        .split(/[,\s]+/)
        .map((n) => Number(n))
        .filter((n) => !Number.isNaN(n));
      if (nums.length) {
        out.set(tok, nums);
      }
    }
  }
  return out;
}

/**
 * Route dictated sentences to the Dictation sections they belong to.
 * Returns verbatim text per Dictation section plus any sentences placed
 * nowhere. Throws on agent failure; the caller should fall back to filling
 * each section with the full dictation.
 */
export async function routeDictationToSections(args: {
  client: CortiClient;
  dictationText: string;
  targetSections: RouteTarget[];
}): Promise<RoutingResult> {
  const { client, dictationText, targetSections } = args;
  const sentences = splitSentences(dictationText);
  if (sentences.length === 0 || targetSections.length === 0) {
    return { routed: new Map(), unallocated: [] };
  }

  // Assign each section a stable token so the agent's JSON keys don't
  // depend on (possibly non-unique or non-ASCII) heading text.
  const targets = targetSections.map((s, i) => ({ ...s, token: `S${i + 1}` }));

  const sectionsList = targets.map((t) => `[${t.token}] ${t.heading || t.name}`).join("\n");
  const sentencesList = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const message = `Sections to fill (route sentences ONLY to these):
${sectionsList}

Dictation sentences:
${sentencesList}

Output the JSON mapping now.`;

  const spec: AgentSpec = {
    name: ROUTER_AGENT_NAME,
    description: ROUTER_AGENT_DESCRIPTION,
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
  const routing = parseRouting(
    raw,
    targets.map((t) => t.token),
  );

  // Reassemble verbatim. Dedupe indices across sections in template order so
  // a sentence never appears in two off sections.
  const used = new Set<number>();
  const routed = new Map<string, string>();
  for (const t of targets) {
    const indices = routing.get(t.token) ?? [];
    const picked: string[] = [];
    for (const idx of indices) {
      const i = idx - 1;
      if (Number.isInteger(i) && i >= 0 && i < sentences.length && !used.has(i)) {
        used.add(i);
        picked.push(sentences[i]);
      }
    }
    routed.set(t.id, picked.join(" "));
  }

  const unallocated = sentences.filter((_, i) => !used.has(i));
  return { routed, unallocated };
}

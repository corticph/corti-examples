/**
 * The "My Note Style Memory" agent: interprets the diff between a generated
 * note section and the clinician's edited version, then proposes a template
 * prompt update to capture the pattern.
 *
 * The agent receives, per changed section:
 *   - The section heading + current template prompts (contentPrompt,
 *     writingStylePrompt, miscPrompt)
 *   - The previously learned prompt updates for the section (from earlier
 *     edit cycles), so new proposals merge with them instead of contradicting
 *     or duplicating them
 *   - The original generated text vs. the edited text
 *
 * It returns JSON classifying the change as "soft" (style/phrasing) or "hard"
 * (memory rule), naming the prompt surface to update, and proposing the new
 * prompt text: the COMPLETE replacement for that surface, merged with
 * whatever was previously learned for it.
 *
 * This is a generic, stateless agent (isolated messages, no contextId) — the
 * same pattern as scribe-like-me and on-demand-agent.
 */
import type { CortiClient } from "@corti/sdk";
import { describeAgentError, ensureAgent, sendAgentMessage } from "../_shared/cortiAgent";
import type { TemplateSection } from "./documents";
import type { MemoryClassification, MemoryEntry, PromptSurface } from "./memoryStore";

export const AGENT_META = {
  name: "My Note Style Memory",
  description:
    "Interprets edits to generated clinical notes and proposes template prompt updates to personalise future generation.",
};

export const DEFAULT_AGENT_PROMPT = `You are a clinical documentation personalisation engine.

A clinician has generated a note from a template, then edited it. Your job is
to interpret the edit — understand WHAT changed and WHY — and propose a
template prompt update that would make future generation match the clinician's
preference without needing that edit.

You receive one section at a time with:
- The section heading and its current template prompts (contentPrompt,
  writingStylePrompt, miscPrompt)
- PREVIOUSLY LEARNED: the prompt updates already learned for this section
  in earlier edit cycles ("(none yet)" on the first cycle)
- The ORIGINAL generated text (before editing)
- The EDITED text (what the clinician changed it to)

Classify the change as either:
- "soft": a style preference — phrasing, terseness, sentence structure,
  abbreviation usage, tone, length, formatting. These belong in
  writingStylePrompt (for voice/register) or contentPrompt (for what to
  include/exclude).
- "hard": a non-negotiable rule — "always include medication dosages", "never
  use abbreviations for this section", "always end with a safety net
  disclaimer". These are "memory" rules that belong in miscPrompt, formatted as
  a clear imperative instruction.

Prompt surface guidance:
- contentPrompt: what clinical information belongs in the section
- writingStylePrompt: voice, register, sentence form, abbreviations, phrasing
- miscPrompt: hard rules, guardrails, fixed disclaimers, edge-case handling.
  For hard rules, phrase them as imperative instructions in a
  "Very important rules" block.

Merge with previous learning: write the proposedPromptUpdate as the COMPLETE
replacement text for the chosen prompt surface (not a diff — the full text the
prompt should become after this change). If PREVIOUSLY LEARNED contains
instructions for that same surface, merge them with the new edit: keep the
previously learned instructions that still apply, resolve contradictions in
favour of the clinician's newest edit (the newest edit wins), and drop
instructions the newest edit clearly supersedes. Keep it concrete and
imperative.

If the edit is trivial (a typo fix, whitespace, minor punctuation) and does
not reflect a pattern worth learning, return classification "soft" with an
empty proposedPromptUpdate — the caller will skip storing it.

Respond with ONLY a JSON object, no markdown fences, no commentary:
{
  "classification": "soft" | "hard",
  "promptSurface": "contentPrompt" | "writingStylePrompt" | "miscPrompt",
  "changeDescription": "<one sentence: what the clinician changed>",
  "proposedPromptUpdate": "<full replacement prompt text, or empty string for trivial edits>",
  "rationale": "<one sentence: why this prompt change captures the pattern>"
}`;

const AGENT_ID_KEY = "myNoteStyle.agentId";

import {
  type ConfigStore,
  createLocalConfigStore,
  identityNamespace,
} from "../_shared/configStore";

let store: ConfigStore = createLocalConfigStore("default");
let agentId: string | null = null;

export function configureMyNoteStyleAgent(clientId?: string, tenant?: string) {
  const next = identityNamespace(clientId, tenant);
  store = createLocalConfigStore(next);
  agentId = store.get<string>(AGENT_ID_KEY, "") || null;
}

async function getAgentId(client: CortiClient): Promise<string> {
  if (!agentId) {
    agentId = await ensureAgent(client, {
      ...AGENT_META,
      systemPrompt: DEFAULT_AGENT_PROMPT,
    });
    store.set(AGENT_ID_KEY, agentId);
  }
  return agentId;
}

export interface AgentDiffInput {
  section: TemplateSection;
  originalText: string;
  editedText: string;
  /** Prompt updates already learned for this section (earlier edit cycles). */
  existingMemories?: MemoryEntry[];
}

export interface AgentDiffResult {
  classification: MemoryClassification;
  promptSurface: PromptSurface;
  changeDescription: string;
  proposedPromptUpdate: string;
  rationale: string;
}

function parseAgentJson(raw: string): unknown {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text
      .replace(/^```(json)?/, "")
      .replace(/```$/, "")
      .trim();
  }
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("Agent did not return JSON.");
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(record: Record<string, unknown>, key: string): string {
  const v = record[key];
  return typeof v === "string" ? v : "";
}

/** Parse and validate the agent's response into a typed result. */
export function parseAgentResponse(raw: string): AgentDiffResult {
  const parsed = parseAgentJson(raw);
  if (!isRecord(parsed)) {
    throw new Error("Agent response must be a JSON object.");
  }
  const classification = parsed.classification;
  if (classification !== "soft" && classification !== "hard") {
    throw new Error(`Agent returned invalid classification: ${String(classification)}`);
  }
  const promptSurface = parsed.promptSurface;
  if (
    promptSurface !== "contentPrompt" &&
    promptSurface !== "writingStylePrompt" &&
    promptSurface !== "miscPrompt"
  ) {
    throw new Error(`Agent returned invalid promptSurface: ${String(promptSurface)}`);
  }
  return {
    classification,
    promptSurface,
    changeDescription: asString(parsed, "changeDescription"),
    proposedPromptUpdate: asString(parsed, "proposedPromptUpdate"),
    rationale: asString(parsed, "rationale"),
  };
}

/** Check if a section's text was actually changed by the clinician. */
export function hasSectionChanged(original: string, edited: string): boolean {
  return original.trim() !== edited.trim();
}

/** Send one changed section to the agent and get back a proposed prompt update. */
export async function interpretEdit(
  client: CortiClient,
  input: AgentDiffInput,
): Promise<AgentDiffResult> {
  const id = await getAgentId(client);
  const { section, originalText, editedText, existingMemories } = input;
  const previouslyLearned =
    (existingMemories ?? [])
      .filter((m) => m.proposedPromptUpdate)
      .map((m) => `- (${m.promptSurface}) ${m.proposedPromptUpdate}`)
      .join("\n") || "(none yet)";
  const message = `SECTION: ${section.heading}

CURRENT PROMPTS:
- contentPrompt: ${section.contentPrompt || "(empty)"}
- writingStylePrompt: ${section.writingStylePrompt || "(empty)"}
- miscPrompt: ${section.miscPrompt || "(empty)"}

PREVIOUSLY LEARNED:
${previouslyLearned}

ORIGINAL GENERATED TEXT:
${originalText}

EDITED TEXT:
${editedText}`;

  const raw = await sendAgentMessage(client, id, message);
  return parseAgentResponse(raw);
}

export { describeAgentError };

/**
 * The "scribe like me" tailoring pipeline: two Corti Agentic Framework agents
 * (`client.agents.*`, via `_shared/cortiAgent.ts`), run in sequence.
 *
 * 1. Style Reviewer reads a clinician's historical notes and writes a prose
 *    style summary (structure, tone, terseness vs. narrative, characteristic
 *    phrasing/abbreviations, what's emphasized or omitted).
 * 2. Template Tailor takes that summary plus a shortlist of candidate Corti
 *    Standard templates (each with its default per-section prompts) and picks
 *    the best-fit template, returning one override entry per section — the
 *    exact shape Guided Documents expects on `documents.generate`'s
 *    `templateRef.overrides` (see `documents.ts`).
 *
 * Both agents are generic and stateless (isolated messages, no contextId),
 * exactly like chart-prep-workflow's fact-extractor → note-drafter →
 * code-suggester pipeline: the agent's role lives in its systemPrompt, and
 * persona-specific data is passed in the message body on every call.
 *
 * Both prompts are editable (see `ScribeLikeMeDetails.tsx`), same pattern as
 * second-pass-agent / wake-command-agent: a draft is persisted to
 * localStorage per API client, and saving pushes it to the live agent via
 * `client.agents.update`. `ensureAgent` matches an existing agent by *name*,
 * so if "Scribe Style Reviewer"/"Scribe Template Tailor" were already
 * created in a tenant before a prompt change lands here, that tenant keeps
 * running the old prompt until it's explicitly saved (or reset) once from
 * this editor — creation only ever uses the current prompt for a brand new
 * agent.
 */
import type { Corti, CortiAuth } from "@corti/sdk";
import { CortiClient } from "@corti/sdk";
import { useSyncExternalStore } from "react";
import {
  type ConfigStore,
  createLocalConfigStore,
  identityNamespace,
} from "../_shared/configStore";
import { describeAgentError, ensureAgent, sendAgentMessage } from "../_shared/cortiAgent";
import type { CortiSdkEnvironment } from "../_shared/useCortiAccessToken";
import type { StyleProfile, StyleSectionOverride } from "./personaStore";

export const STYLE_REVIEWER_META = {
  name: "Scribe Style Reviewer",
  description: "Reads a clinician's historical notes and summarizes their documentation style.",
};

export const TEMPLATE_TAILOR_META = {
  name: "Scribe Template Tailor",
  description:
    "Picks the best-fit Corti Standard template for a clinician and proposes per-section prompt overrides to match their documentation style.",
};

export const DEFAULT_REVIEWER_PROMPT = `You are a clinical documentation analyst. A clinician has shared a batch of
their own historical notes so a future note-generation system can be tailored
to match how THEY personally document, instead of a generic default style.

Given a clinician's name, specialty, and a set of their historical notes,
write a concise (3-6 sentence) style summary covering: how they structure a
note (distinct SOAP-style sections vs. one narrative paragraph, and in what
order), sentence structure (fragments vs. full prose), characteristic
abbreviations or phrasing, what they routinely include or omit, and any
closing/plan habits. Ground every claim in a pattern that recurs across
multiple notes — do not invent a trait you only see once. Return ONLY the
summary text, no preamble, no headers.`;

export const DEFAULT_TAILOR_PROMPT = `You are a clinical documentation template tailor. You receive a style
summary for one clinician (produced by a separate review step) plus a JSON
array of candidate templates. Each candidate has a templateId, templateName,
and a sections array; each section has a sectionId, family, heading,
contentPrompt (what the section includes by default), and writingStylePrompt
(the default tone/format). It also includes miscPrompt and outputShape as
read-only context. outputShape is a compact summary of the resolved outputSchema:
its node types, rendering formats, descriptions, field structure, and whether
an enum constrains a node.

Your job:
1. Pick whichever candidate template's section structure best matches how
   this clinician organizes a note per the style summary. Section boundaries
   matter more than surface brevity: if the style summary shows the
   clinician keeps two things clearly separate (e.g. exam findings vs.
   assessment/diagnosis, or history vs. review of systems), do not pick a
   candidate that merges those into one section just because it looks more
   concise overall — prefer a candidate that preserves that split, even if
   it has more sections total. Only accept a merge when the style summary
   itself shows the clinician routinely blends that content together.
2. For EVERY section in the chosen template (all of them, none skipped),
   decide whether the default contentPrompt/writingStylePrompt needs to be
   overridden to reproduce this clinician's style. Only set an override field
   when the style summary shows a clear pattern that differs from the
   default; otherwise leave that field null and explain in "rationale" why
   the default already matches.
3. Write any override as a concrete, imperative generation instruction (e.g.
   "Use telegraphic sentence fragments; abbreviate patient as 'pt', history as
   'hx'; omit articles"), not a vague adjective.
4. Optionally set templatePromptOverride for any cross-section instruction
   (overall tone/persona/framing); use null if nothing cross-cutting applies.

Hard constraints:
- Treat miscPrompt and outputShape as immutable. Never propose or imply an
  outputSchema change; every override must work within the existing rendering
  shape and fixed fields.
- contentPrompt controls which clinical information belongs in the section.
  writingStylePrompt controls voice, register, sentence form, abbreviations,
  and phrasing. Do not put style rules in contentPrompt or content-routing rules
  in writingStylePrompt.
- Do not request narrative paragraphs from a fixed-field schema, or manually
  add headings, bullets, labels, or separators that outputShape already renders.
- A topic being absent from the historical notes is not, by itself, evidence
  that the clinician intentionally excludes it; encounter mix may explain the
  absence. Preserve the default content scope unless a recurring affirmative
  pattern clearly supports a change.
- An override must not contradict the inherited contentPrompt, miscPrompt, or
  outputShape.

Respond with ONLY a JSON object, no markdown code fences, no commentary,
matching exactly this shape:
{
  "templateId": "<the chosen candidate's templateId>",
  "templatePromptOverride": "<string, or null>",
  "sections": [
    {
      "sectionId": "<must match a sectionId from the chosen template>",
      "headingOverride": "<string, or null>",
      "contentPromptOverride": "<string, or null>",
      "writingStylePromptOverride": "<string, or null>",
      "rationale": "<short evidence-based note, required, non-empty>"
    }
  ]
}
Include exactly one "sections" entry per section in the chosen template.`;

export interface CandidateSection {
  sectionId: string;
  family?: string;
  heading: string;
  contentPrompt: string;
  writingStylePrompt: string;
  /** Domain-specific inherited rules supplied only to prevent contradictory overrides. */
  miscPrompt: string;
  /** Compact, read-only summary of the fully resolved outputSchema. */
  outputShape: CandidateOutputShape | null;
}

export interface CandidateOutputShape {
  type: Corti.GuidedOutputSchema["type"];
  description?: string;
  itemFormat?: string;
  fieldFormat?: string;
  enumValueCount?: number;
  items?: CandidateOutputShape;
  fields?: Array<{
    key: string;
    description: string;
    value: CandidateOutputShape;
  }>;
}

/** Remove value-level schema details while retaining the rendering contract the
 * tailor needs to avoid suggesting prompts that fight the resolved schema. */
export function summarizeOutputShape(
  schema: Corti.GuidedOutputSchema | undefined,
): CandidateOutputShape | null {
  if (!schema) {
    return null;
  }
  const summary: CandidateOutputShape = {
    type: schema.type,
    ...(schema.description ? { description: schema.description } : {}),
  };
  if ((schema.type === "string" || schema.type === "number") && schema.enum) {
    summary.enumValueCount = schema.enum.length;
  }
  if (schema.type === "array") {
    if (schema.itemFormat) {
      summary.itemFormat = schema.itemFormat;
    }
    summary.items = summarizeOutputShape(schema.items) as CandidateOutputShape;
  }
  if (schema.type === "object") {
    if (schema.fieldFormat) {
      summary.fieldFormat = schema.fieldFormat;
    }
    if (schema.fields?.length) {
      summary.fields = schema.fields.map((field) => ({
        key: field.key,
        description: field.description,
        value: summarizeOutputShape(field.value) as CandidateOutputShape,
      }));
    }
  }
  return summary;
}

export interface CandidateTemplate {
  templateId: string;
  templateName: string;
  sections: CandidateSection[];
}

/** Replace long UUID sectionIds with short, LLM-friendly aliases (s1, s2, …)
 * before sending candidate templates to the Tailor agent. The agent's
 * response will reference these aliases; `remapTailorResult` converts them
 * back to real section IDs after validation. This avoids a class of
 * failures where the LLM slightly garbles a 36-character UUID it was asked
 * to echo back verbatim. */
export function aliasCandidateSections(candidates: CandidateTemplate[]): {
  aliased: CandidateTemplate[];
  idMap: Map<string, string>;
} {
  const idMap = new Map<string, string>();
  const aliased = candidates.map((tmpl) => ({
    ...tmpl,
    sections: tmpl.sections.map((s, i) => {
      const alias = `s${i + 1}`;
      idMap.set(alias, s.sectionId);
      return { ...s, sectionId: alias };
    }),
  }));
  return { aliased, idMap };
}

/** Replace aliased section IDs in a validated TailorResult with the real
 * section IDs from the original candidates. */
export function remapTailorResult(result: TailorResult, idMap: Map<string, string>): TailorResult {
  return {
    ...result,
    sections: result.sections.map((s) => ({
      ...s,
      sectionId: idMap.get(s.sectionId) ?? s.sectionId,
    })),
  };
}

export type AnalysisStage = "reviewing" | "tailoring";

const REVIEWER_ID_KEY = "scribeLikeMe.reviewerAgentId";
const TAILOR_ID_KEY = "scribeLikeMe.tailorAgentId";
const REVIEWER_PROMPT_KEY = "scribeLikeMe.reviewerPrompt";
const TAILOR_PROMPT_KEY = "scribeLikeMe.tailorPrompt";

export type AgentPromptStatus = "idle" | "preparing" | "ready" | "error";

interface AgentPromptState {
  reviewerPrompt: string;
  tailorPrompt: string;
  status: AgentPromptStatus;
  error?: string;
}

let client: CortiClient | null = null;
let lastAuth: CortiAuth.AuthTokenDerivable | null = null;
// Persistence (and the cached agent ids below) is namespaced by API client
// (clientId:tenant) — see configureScribeAgents. Previously agent ids here
// were cached in raw, unnamespaced localStorage, which meant switching
// tenant/client could reuse a cached id that actually belonged to a
// different tenant's agent; routing it through the same namespaced store
// personaStore.ts uses fixes that.
let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);
let reviewerAgentId: string | null = null;
let tailorAgentId: string | null = null;

let promptState: AgentPromptState = {
  reviewerPrompt: DEFAULT_REVIEWER_PROMPT,
  tailorPrompt: DEFAULT_TAILOR_PROMPT,
  status: "idle",
};

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) {
    l();
  }
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function setPromptState(patch: Partial<AgentPromptState>) {
  promptState = { ...promptState, ...patch };
  emit();
}

/** Wire auth + identity into the agent pipeline. Call from the applet on mount / auth change. */
export function configureScribeAgents(
  authConfig: CortiAuth.AuthTokenDerivable,
  environment: CortiSdkEnvironment,
  clientId?: string,
  tenant?: string,
) {
  if (authConfig !== lastAuth) {
    lastAuth = authConfig;
    client = new CortiClient({ environment, auth: authConfig });
  }
  const nextNamespace = identityNamespace(clientId, tenant);
  if (nextNamespace !== namespace) {
    namespace = nextNamespace;
    store = createLocalConfigStore(nextNamespace);
    reviewerAgentId = store.get<string>(REVIEWER_ID_KEY, "") || null;
    tailorAgentId = store.get<string>(TAILOR_ID_KEY, "") || null;
    setPromptState({
      reviewerPrompt: store.get<string>(REVIEWER_PROMPT_KEY, "") || DEFAULT_REVIEWER_PROMPT,
      tailorPrompt: store.get<string>(TAILOR_PROMPT_KEY, "") || DEFAULT_TAILOR_PROMPT,
      status: "idle",
      error: undefined,
    });
  }
}

async function getReviewerAgentId(activeClient: CortiClient): Promise<string> {
  if (!reviewerAgentId) {
    reviewerAgentId = await ensureAgent(activeClient, {
      ...STYLE_REVIEWER_META,
      systemPrompt: promptState.reviewerPrompt,
    });
    store.set(REVIEWER_ID_KEY, reviewerAgentId);
  }
  return reviewerAgentId;
}

async function getTailorAgentId(activeClient: CortiClient): Promise<string> {
  if (!tailorAgentId) {
    tailorAgentId = await ensureAgent(activeClient, {
      ...TEMPLATE_TAILOR_META,
      systemPrompt: promptState.tailorPrompt,
    });
    store.set(TAILOR_ID_KEY, tailorAgentId);
  }
  return tailorAgentId;
}

/** Persist a Style Reviewer prompt draft and, if that agent already exists,
 * push it live via `client.agents.update` (if it doesn't exist yet, the next
 * call just creates it with this prompt). */
export async function saveReviewerPrompt(prompt: string) {
  store.set(REVIEWER_PROMPT_KEY, prompt);
  setPromptState({ reviewerPrompt: prompt });
  if (!client || !reviewerAgentId) {
    return;
  }
  setPromptState({ status: "preparing", error: undefined });
  try {
    await client.agents.update(reviewerAgentId, { systemPrompt: prompt });
    setPromptState({ status: "ready" });
  } catch (e) {
    setPromptState({ status: "error", error: describeAgentError(e) });
  }
}

export const resetReviewerPrompt = () => saveReviewerPrompt(DEFAULT_REVIEWER_PROMPT);

/** Same as `saveReviewerPrompt`, for the Template Tailor agent. */
export async function saveTailorPrompt(prompt: string) {
  store.set(TAILOR_PROMPT_KEY, prompt);
  setPromptState({ tailorPrompt: prompt });
  if (!client || !tailorAgentId) {
    return;
  }
  setPromptState({ status: "preparing", error: undefined });
  try {
    await client.agents.update(tailorAgentId, { systemPrompt: prompt });
    setPromptState({ status: "ready" });
  } catch (e) {
    setPromptState({ status: "error", error: describeAgentError(e) });
  }
}

export const resetTailorPrompt = () => saveTailorPrompt(DEFAULT_TAILOR_PROMPT);

export function useScribeAgentPrompts(): AgentPromptState {
  return useSyncExternalStore(
    subscribe,
    () => promptState,
    () => promptState,
  );
}

export interface TailorSectionResult {
  sectionId: string;
  headingOverride: string | null;
  contentPromptOverride: string | null;
  writingStylePromptOverride: string | null;
  rationale: string;
}

export interface TailorResult {
  templateId: string;
  templatePromptOverride: string | null;
  sections: TailorSectionResult[];
}

function parseTailorJson(raw: string): unknown {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text
      .replace(/^```(json)?/, "")
      .replace(/```$/, "")
      .trim();
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("Template Tailor agent did not return JSON.");
    }
    try {
      return JSON.parse(text.slice(start, end + 1)) as unknown;
    } catch {
      throw new Error("Template Tailor agent did not return valid JSON.");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(record: Record<string, unknown>, key: string, location: string) {
  const value = record[key];
  if (value !== null && typeof value !== "string") {
    throw new Error(
      `Template Tailor returned invalid ${location}.${key}; expected string or null.`,
    );
  }
  return value as string | null;
}

/** Parse and strictly validate the agent's response against the candidates it
 * actually received. Invalid IDs or incomplete section coverage are surfaced
 * as analysis errors instead of being silently repaired. */
export function parseAndValidateTailorResponse(
  raw: string,
  candidates: CandidateTemplate[],
): TailorResult {
  const parsed = parseTailorJson(raw);
  if (!isRecord(parsed)) {
    throw new Error("Template Tailor response must be a JSON object.");
  }
  if (typeof parsed.templateId !== "string") {
    throw new Error("Template Tailor response is missing a valid templateId.");
  }
  const chosen = candidates.find((candidate) => candidate.templateId === parsed.templateId);
  if (!chosen) {
    throw new Error(`Template Tailor selected unknown templateId: ${parsed.templateId}.`);
  }
  const templatePromptOverride = nullableString(parsed, "templatePromptOverride", "response");
  if (!Array.isArray(parsed.sections)) {
    throw new Error("Template Tailor response must include a sections array.");
  }

  const expectedIds = new Set(chosen.sections.map((section) => section.sectionId));
  const seenIds = new Set<string>();
  const sections = parsed.sections.map((value, index): TailorSectionResult => {
    const location = `sections[${index}]`;
    if (!isRecord(value) || typeof value.sectionId !== "string") {
      throw new Error(`Template Tailor returned an invalid ${location}.sectionId.`);
    }
    if (!expectedIds.has(value.sectionId)) {
      throw new Error(`Template Tailor returned unknown sectionId: ${value.sectionId}.`);
    }
    if (seenIds.has(value.sectionId)) {
      throw new Error(`Template Tailor returned duplicate sectionId: ${value.sectionId}.`);
    }
    seenIds.add(value.sectionId);
    if (typeof value.rationale !== "string" || !value.rationale.trim()) {
      throw new Error(`Template Tailor returned an empty rationale for ${value.sectionId}.`);
    }
    return {
      sectionId: value.sectionId,
      headingOverride: nullableString(value, "headingOverride", location),
      contentPromptOverride: nullableString(value, "contentPromptOverride", location),
      writingStylePromptOverride: nullableString(value, "writingStylePromptOverride", location),
      rationale: value.rationale.trim(),
    };
  });

  const missingIds = [...expectedIds].filter((sectionId) => !seenIds.has(sectionId));
  if (missingIds.length > 0) {
    throw new Error(`Template Tailor omitted sectionIds: ${missingIds.join(", ")}.`);
  }
  return { templateId: chosen.templateId, templatePromptOverride, sections };
}

/** Turn one Tailor agent response plus the candidate it targeted into a
 * ready-to-save StyleProfile. Shared by the full pipeline and by
 * `retailorForTemplate`, which re-runs only this step against a clinician's
 * own template choice. */
function styleProfileFromTailorResult(
  chosen: CandidateTemplate,
  styleSummary: string,
  parsed: TailorResult,
): StyleProfile {
  const overridesBySection = new Map(parsed.sections.map((s) => [s.sectionId, s]));
  const sections: StyleSectionOverride[] = chosen.sections.map((def) => {
    const ov = overridesBySection.get(def.sectionId);
    return {
      sectionId: def.sectionId,
      family: def.family,
      defaultHeading: def.heading,
      defaultContentPrompt: def.contentPrompt,
      defaultWritingStylePrompt: def.writingStylePrompt,
      headingOverride: ov?.headingOverride ?? null,
      contentPromptOverride: ov?.contentPromptOverride ?? null,
      writingStylePromptOverride: ov?.writingStylePromptOverride ?? null,
      rationale: ov?.rationale ?? "",
    };
  });
  return {
    templateId: chosen.templateId,
    templateName: chosen.templateName,
    styleSummary,
    templatePromptOverride: parsed.templatePromptOverride ?? null,
    sections,
    analyzedAt: new Date().toISOString(),
    customTemplate: null,
  };
}

/**
 * Run the two-stage pipeline for one persona: review historical notes, then
 * tailor the best-fit candidate template. Returns a ready-to-save StyleProfile.
 */
export async function runStyleAnalysis(
  personaName: string,
  specialty: string,
  notes: string[],
  candidates: CandidateTemplate[],
  onStage?: (stage: AnalysisStage) => void,
): Promise<StyleProfile> {
  if (!client) {
    throw new Error("Agents not configured — auth not ready yet.");
  }
  const activeClient = client;

  onStage?.("reviewing");
  const reviewerId = await getReviewerAgentId(activeClient);
  const notesBlock = notes.map((n, i) => `--- Historical note ${i + 1} ---\n${n}`).join("\n\n");
  const reviewMessage = `Clinician: ${personaName} (${specialty})\n\n${notesBlock}`;
  const styleSummary = await sendAgentMessage(activeClient, reviewerId, reviewMessage);
  if (!styleSummary.trim()) {
    throw new Error("Style Reviewer agent returned no summary.");
  }

  onStage?.("tailoring");
  const tailorId = await getTailorAgentId(activeClient);
  const { aliased, idMap } = aliasCandidateSections(candidates);
  const tailorMessage = `STYLE SUMMARY:\n${styleSummary}\n\nCANDIDATE TEMPLATES:\n${JSON.stringify(aliased, null, 2)}`;
  const tailorRaw = await sendAgentMessage(activeClient, tailorId, tailorMessage);
  const parsed = parseAndValidateTailorResponse(tailorRaw, aliased);
  const remapped = remapTailorResult(parsed, idMap);
  const chosen = candidates.find((c) => c.templateId === remapped.templateId);
  if (!chosen) {
    throw new Error("Validated template was not found in the candidate list.");
  }
  return styleProfileFromTailorResult(chosen, styleSummary, remapped);
}

/**
 * Re-run just the Template Tailor step against a single, clinician-chosen
 * template, reusing an already-computed style summary — no need to re-run
 * the Style Reviewer. Passing a candidate list of exactly one item
 * structurally guarantees the result targets that template (rather than
 * relying on prompt instructions alone to respect the choice), while still
 * generating fresh per-section overrides for that template's own sections.
 */
export async function retailorForTemplate(
  styleSummary: string,
  candidate: CandidateTemplate,
): Promise<StyleProfile> {
  if (!client) {
    throw new Error("Agents not configured — auth not ready yet.");
  }
  const activeClient = client;
  const tailorId = await getTailorAgentId(activeClient);
  const { aliased, idMap } = aliasCandidateSections([candidate]);
  const tailorMessage = `STYLE SUMMARY:\n${styleSummary}\n\nCANDIDATE TEMPLATES:\n${JSON.stringify(aliased, null, 2)}`;
  const tailorRaw = await sendAgentMessage(activeClient, tailorId, tailorMessage);
  const parsed = parseAndValidateTailorResponse(tailorRaw, aliased);
  const remapped = remapTailorResult(parsed, idMap);
  return styleProfileFromTailorResult(candidate, styleSummary, remapped);
}

export { describeAgentError };

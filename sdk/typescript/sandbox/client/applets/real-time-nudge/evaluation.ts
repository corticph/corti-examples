import type { Corti } from "@corti/sdk";
import type { CodeConditionEntry, NudgeRule } from "./nudgeRules";

export type Decision = "matched" | "not-matched" | "unknown";
export type Side = "trigger" | "resolve";
export type CodeSystem = "snomed" | "icd10";
export interface CriterionDecision {
  id: string;
  outcome: Decision;
  explanation?: string;
  message?: string;
  /** References to the request's codes/evidence, never invented display data. */
  evidence?: { codeIndex: number; evidenceIndexes: number[] }[];
}
export interface EvaluationResponse {
  decisions: CriterionDecision[];
}
export interface CodeCriterion extends CodeConditionEntry {
  id: string;
  system: CodeSystem;
}
export function criterionId(ruleId: string, side: Side, type: string, index?: number) {
  return index === undefined ? `${ruleId}:${side}:${type}` : `${ruleId}:${side}:${type}:${index}`;
}
export function codeCriteria(rules: NudgeRule[]): CodeCriterion[] {
  return rules
    .filter((r) => r.enabled)
    .flatMap((rule) =>
      (["trigger", "resolve"] as const).flatMap((side) =>
        (["snomed", "icd10"] as const).flatMap((system) =>
          (rule[side][system]?.conditions ?? []).map((condition, index) => ({
            ...condition,
            id: criterionId(rule.id, side, system, index),
            system,
          })),
        ),
      ),
    );
}
export function combine(outcomes: Decision[], mode: "all" | "any" = "all"): Decision {
  if (mode === "all") {
    if (outcomes.includes("not-matched")) {
      return "not-matched";
    }
    return outcomes.includes("unknown") ? "unknown" : "matched";
  }
  if (outcomes.includes("matched")) {
    return "matched";
  }
  return outcomes.includes("unknown") ? "unknown" : "not-matched";
}
export function systemMatches(system: string, expected: CodeSystem) {
  return expected === "snomed" ? system.startsWith("snomed") : system.startsWith("icd10cm");
}
export function predictedCodes(codes: Corti.CodesGeneralResponse) {
  return [...codes.codes, ...codes.candidates];
}

/** Client-side pre-evaluation of op="=" criteria — exact-match lookups need no agent. */
export function preEvaluateExact(
  criteria: CodeCriterion[],
  codes: Corti.CodesGeneralResponse,
): CriterionDecision[] {
  const all = predictedCodes(codes);
  return criteria
    .filter((c) => c.op === "=")
    .map((criterion) => {
      const matchIndex = all.findIndex(
        (code) => code.code === criterion.code && systemMatches(code.system, criterion.system),
      );
      const evidenceIndexes =
        matchIndex !== -1
          ? (all[matchIndex].evidences ?? []).map((_, i) => i)
          : [];
      if (criterion.condition === "present") {
        if (matchIndex !== -1) {
          return {
            id: criterion.id,
            outcome: "matched" as const,
            explanation: `Code ${criterion.code} is present in predictions.`,
            evidence: [{ codeIndex: matchIndex, evidenceIndexes }],
          };
        }
        return {
          id: criterion.id,
          outcome: "not-matched" as const,
          explanation: `Code ${criterion.code} is not in predictions.`,
        };
      }
      // condition === "absent"
      if (matchIndex === -1) {
        return {
          id: criterion.id,
          outcome: "matched" as const,
          explanation: `Code ${criterion.code} is absent from predictions.`,
        };
      }
      return {
        id: criterion.id,
        outcome: "not-matched" as const,
        explanation: `Code ${criterion.code} is present in predictions.`,
      };
    });
}

/** Extract the first JSON object from a raw agent response, handling markdown fences and prose. */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Direct JSON or ```json fenced block at the start.
  const direct = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(direct);
  } catch {
    // Not pure JSON — try to find a ```json ... ``` block anywhere.
  }
  const fenceMatch = trimmed.match(/```json\s*\n([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Fall through to brace matching.
    }
  }
  // Find the first {...} span as a last resort.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // Give up — caller will throw invalid response.
    }
  }
  throw new Error("Agent returned an invalid criterion response");
}

/** A missing/invalid decision stays unknown; never silently turn it into false. */
export function validateResponse(
  raw: string,
  expected: { id: string; system?: CodeSystem; op?: string; code?: string; condition?: string }[],
  codes?: Corti.CodesGeneralResponse,
): EvaluationResponse {
  const parsed: unknown = extractJson(raw);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("decisions" in parsed) ||
    !Array.isArray(parsed.decisions)
  ) {
    throw new Error("Agent returned an invalid criterion response");
  }
  const allowed = new Set(expected.map((c) => c.id));
  const rows = parsed.decisions as Record<string, unknown>[];
  // Coerce array-form IDs back to their colon-delimited string form (some
  // models return the JSON-parsed array instead of the original string).
  for (const row of rows) {
    if (row && typeof row === "object" && Array.isArray(row.id)) {
      row.id = (row.id as unknown[]).map(String).join(":");
    }
  }
  if (
    rows.some(
      (row) =>
        !row || typeof row !== "object" || typeof row.id !== "string" || !allowed.has(row.id),
    )
  ) {
    throw new Error("Agent returned an unknown criterion ID");
  }
  return {
    decisions: expected.map((criterion) => {
      const matches = rows.filter((row) => row.id === criterion.id);
      const row = matches[0];
      const unknown = (explanation: string): CriterionDecision => ({
        id: criterion.id,
        outcome: "unknown",
        explanation,
      });
      if (
        matches.length !== 1 ||
        !["matched", "not-matched", "unknown"].includes(String(row?.outcome))
      ) {
        return unknown("Missing, duplicate, or invalid agent decision");
      }
      if (
        !criterion.system &&
        row.outcome === "matched" &&
        (typeof row.message !== "string" || !row.message.trim())
      ) {
        return unknown("Matched prompt criterion has no message");
      }
      const evidence: NonNullable<CriterionDecision["evidence"]> = [];
      if (row.evidence !== undefined) {
        if (!Array.isArray(row.evidence) || !codes || !criterion.system) {
          return unknown("Invalid evidence");
        }
        const all = predictedCodes(codes);
        for (const ref of row.evidence) {
          if (
            !ref ||
            !Number.isInteger(ref.codeIndex) ||
            ref.codeIndex < 0 ||
            !Array.isArray(ref.evidenceIndexes)
          ) {
            return unknown("Invalid evidence reference");
          }
          const code = all[ref.codeIndex];
          if (
            !code ||
            !systemMatches(code.system, criterion.system) ||
            ref.evidenceIndexes.some(
              (index: unknown) =>
                !Number.isInteger(index) || Number(index) < 0 || !code.evidences?.[Number(index)],
            )
          ) {
            return unknown("Evidence is outside the supplied coding system or spans");
          }
          if (criterion.op === "=" && code.code !== criterion.code) {
            return unknown("Exact-code evidence does not match");
          }
          if (criterion.op === "descendent-of" && code.code === criterion.code && criterion.condition === "present") {
            return unknown("A proper descendant cannot be the concept itself");
          }
          evidence.push({ codeIndex: ref.codeIndex, evidenceIndexes: ref.evidenceIndexes });
        }
      }
      if (
        criterion.system &&
        criterion.condition === "present" &&
        row.outcome === "matched" &&
        !evidence.length
      ) {
        return unknown("Matched present condition has no code reference");
      }
      return {
        id: criterion.id,
        outcome: row.outcome as Decision,
        ...(typeof row.explanation === "string" ? { explanation: row.explanation } : {}),
        ...(typeof row.message === "string" ? { message: row.message } : {}),
        ...(evidence.length ? { evidence } : {}),
      };
    }),
  };
}

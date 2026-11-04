/**
 * Nudge engine — pure rule evaluation. Given the editor text and the active
 * rule set, returns which rules should fire and which should resolve.
 *
 * Evaluates `textMatch` criteria using the grammar model: `contains`
 * values are parsed as grammar expressions (optional `[]`, alternation
 * `()`, self-references `{}`, AND-ed groups).
 *
 * Agent-assisted criteria (`snomed`, `icd10`, `prompt`) are evaluated via
 * `agentResult` / `promptResult` from the respective Corti agents.
 */

import type { Corti } from "@corti/sdk";
import { combine, criterionId, type Decision, predictedCodes, type Side } from "./evaluation";
import { buildContext, evalContains } from "./grammar";
import type { NudgeRule, TextMatchCriteria } from "./nudgeRules";
import type { AgentNudgeResponse, PromptEvalResponse } from "./snomedAgent";

function evalTextMatch(
  text: string,
  criteria: TextMatchCriteria,
  context?: ReturnType<typeof buildContext>,
): boolean {
  // Conditions (AND or OR depending on mode)
  if (criteria.conditions && criteria.conditions.length > 0) {
    const mode = criteria.mode ?? "any";
    if (mode === "all") {
      if (!criteria.conditions.every((c) => evalContains(text, c.contains, context))) {
        return false;
      }
    } else {
      if (!criteria.conditions.some((c) => evalContains(text, c.contains, context))) {
        return false;
      }
    }
  }

  // NONE conditions (NOT — exclusion list)
  if (criteria.none) {
    if (criteria.none.some((c) => evalContains(text, c.contains, context))) {
      return false;
    }
  }

  // Named groups — count how many match against the minGroups threshold.
  if (criteria.groups && criteria.groups.length > 0) {
    const matched = criteria.groups.filter((g) => evalTextMatch(text, g.criteria, context)).length;
    const min = criteria.minGroups ?? criteria.groups.length;
    if (matched < min) {
      return false;
    }
  }

  return true;
}

export interface CodeMatch {
  parent: Corti.CodesGeneralReadResponse;
  alternatives?: Corti.CodesGeneralReadResponseAlternativesItem[];
}
export interface EvaluateOptions {
  predictResult?: Corti.CodesGeneralResponse | null;
  agentResult?: AgentNudgeResponse | null;
  promptResult?: PromptEvalResponse | null;
}
export interface NudgeEvalResult {
  triggered: Set<string>;
  resolved: Set<string>;
  unknown: Set<string>;
  codeMatches: Map<string, CodeMatch>;
  messages: Map<string, string>;
}

export function evaluateRules(
  text: string,
  rules: NudgeRule[],
  options: EvaluateOptions = {},
): NudgeEvalResult {
  const result: NudgeEvalResult = {
    triggered: new Set(),
    resolved: new Set(),
    unknown: new Set(),
    codeMatches: new Map(),
    messages: new Map(),
  };
  const decisions = new Map(
    [...(options.agentResult?.decisions ?? []), ...(options.promptResult?.decisions ?? [])].map(
      (d) => [d.id, d],
    ),
  );
  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }
    const context = buildContext(rule);
    const evaluateSide = (side: Side): Decision => {
      const criteria = rule[side];
      const outcomes: Decision[] = [];
      if (criteria.textMatch) {
        outcomes.push(evalTextMatch(text, criteria.textMatch, context) ? "matched" : "not-matched");
      }
      for (const system of ["snomed", "icd10"] as const) {
        const group = criteria[system];
        if (!group) {
          continue;
        }
        const groupDecisions = group.conditions.map((_, index) =>
          decisions.get(criterionId(rule.id, side, system, index)),
        );
        const groupOutcome = combine(
          groupDecisions.map((d) => d?.outcome ?? "unknown"),
          group.mode,
        );
        outcomes.push(groupOutcome);
        if (side === "trigger" && groupOutcome === "matched" && options.predictResult) {
          const matched = groupDecisions.find(
            (d, index) =>
              group.conditions[index].condition === "present" &&
              d?.outcome === "matched" &&
              d.evidence?.length,
          );
          const ref = matched?.evidence?.[0];
          const code = ref && predictedCodes(options.predictResult)[ref.codeIndex];
          if (code && ref) {
            result.codeMatches.set(rule.id, {
              parent: {
                ...code,
                evidences: ref.evidenceIndexes.flatMap((index) =>
                  code.evidences?.[index] ? [code.evidences[index]] : [],
                ),
              },
              alternatives: code.alternatives,
            });
          }
        }
      }
      if (criteria.prompt) {
        const decision = decisions.get(criterionId(rule.id, side, "prompt"));
        outcomes.push(decision?.outcome ?? "unknown");
        if (side === "trigger" && decision?.outcome === "matched" && decision.message) {
          result.messages.set(rule.id, decision.message);
        }
      }
      // An empty resolve is never an instruction to resolve every nudge.
      if (!outcomes.length && side === "resolve") {
        return "not-matched";
      }
      return combine(outcomes, criteria.mode);
    };
    const trigger = evaluateSide("trigger");
    const resolve = evaluateSide("resolve");
    if (resolve === "matched") {
      result.resolved.add(rule.id);
    } else if (trigger === "unknown" || (trigger === "matched" && resolve === "unknown")) {
      result.unknown.add(rule.id);
    } else if (trigger === "matched") {
      result.triggered.add(rule.id);
    }
  }
  return result;
}

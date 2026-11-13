import type { Corti } from "@corti/sdk";
import { describe, expect, it } from "vitest";
import {
  type CriterionDecision,
  codeCriteria,
  combine,
  criterionId,
  validateResponse,
} from "./evaluation";
import { evaluateRules } from "./nudgeEngine";
import type { NudgeRule, RuleCriteria } from "./nudgeRules";

const code = {
  conditions: [{ code: "I50.9", op: "=" as const, condition: "present" as const }],
  mode: "all" as const,
};
function rule(trigger: RuleCriteria, resolve: RuleCriteria = {}): NudgeRule {
  return { id: "r", title: "Rule", message: "Message", enabled: true, trigger, resolve };
}
function decision(
  side: "trigger" | "resolve",
  type: string,
  outcome: CriterionDecision["outcome"],
): CriterionDecision {
  return {
    id: criterionId("r", side, type, type === "prompt" ? undefined : 0),
    outcome,
    message: "Specify detail",
  };
}
const predictions: Corti.CodesGeneralResponse = {
  codes: [
    {
      code: "I50.9",
      system: "icd10cm-outpatient",
      display: "Heart failure",
      evidences: [{ text: "heart failure", start: 0, end: 13, contextIndex: 0 }],
    },
  ],
  candidates: [],
  usageInfo: { creditsConsumed: 0 },
};

describe("criterion combination", () => {
  it.each([
    ["all", ["matched", "unknown"], "unknown"],
    ["all", ["not-matched", "unknown"], "not-matched"],
    ["any", ["matched", "unknown"], "matched"],
    ["any", ["not-matched", "unknown"], "unknown"],
  ] as const)("combines %s %j into %s", (mode, values, expected) => {
    expect(combine([...values], mode)).toBe(expected);
  });
  it.each(["all", "any"] as const)("combines prompt + code with outer %s", (mode) => {
    const r = rule({ icd10: code, prompt: { prompt: "Specificity missing" }, mode });
    const agentResult = { decisions: [decision("trigger", "icd10", "matched")] };
    const promptResult = { decisions: [decision("trigger", "prompt", "not-matched")] };
    expect(evaluateRules("CHF", [r], { agentResult, promptResult }).triggered.has("r")).toBe(
      mode === "any",
    );
    expect(evaluateRules("CHF", [r], { agentResult }).unknown.has("r")).toBe(mode === "all");
  });
  it.each(["all", "any"] as const)("combines SNOMED + ICD-10 with outer %s", (mode) => {
    const r = rule({ snomed: code, icd10: code, mode });
    const agentResult = {
      decisions: [
        decision("trigger", "snomed", "matched"),
        decision("trigger", "icd10", "not-matched"),
      ],
    };
    expect(evaluateRules("CHF", [r], { agentResult }).triggered.has("r")).toBe(mode === "any");
  });
  it("uses resolve decisions independently and respects text resolve for a code trigger", () => {
    const r = rule(
      { textMatch: { conditions: [{ contains: "CHF" }] }, icd10: code },
      { icd10: code },
    );
    const agentResult = {
      decisions: [
        decision("trigger", "icd10", "matched"),
        decision("resolve", "icd10", "not-matched"),
      ],
    };
    expect(evaluateRules("CHF", [r], { agentResult }).resolved.size).toBe(0);
    const textResolve = rule(
      { icd10: code },
      { textMatch: { conditions: [{ contains: "documented" }] } },
    );
    expect(evaluateRules("CHF documented", [textResolve], { agentResult }).resolved.has("r")).toBe(
      true,
    );
  });
  it("requires complete combined resolve evidence and gives resolve precedence", () => {
    const r = rule(
      { icd10: code },
      { snomed: code, prompt: { prompt: "Documented" }, mode: "all" },
    );
    const agentResult = {
      decisions: [
        decision("trigger", "icd10", "matched"),
        decision("resolve", "snomed", "matched"),
      ],
    };
    expect(evaluateRules("CHF", [r], { agentResult }).unknown.has("r")).toBe(true);
    const result = evaluateRules("CHF", [r], {
      agentResult,
      promptResult: { decisions: [decision("resolve", "prompt", "matched")] },
    });
    expect(result.resolved.has("r")).toBe(true);
    expect(result.triggered.size).toBe(0);
  });
  it("attaches only explicit evidence, never the first available code", () => {
    const r = rule({ icd10: code });
    const d = decision("trigger", "icd10", "matched");
    expect(
      evaluateRules("CHF", [r], { predictResult: predictions, agentResult: { decisions: [d] } })
        .codeMatches.size,
    ).toBe(0);
    d.evidence = [{ codeIndex: 0, evidenceIndexes: [0] }];
    expect(
      evaluateRules("CHF", [r], {
        predictResult: predictions,
        agentResult: { decisions: [d] },
      }).codeMatches.get("r")?.parent.evidences,
    ).toEqual(predictions.codes[0].evidences);
  });
});

describe("agent response validation", () => {
  const expected = codeCriteria([rule({ icd10: code })]);
  const valid = {
    ...decision("trigger", "icd10", "matched"),
    evidence: [{ codeIndex: 0, evidenceIndexes: [0] }],
  };
  const parse = (decisions: unknown[]) =>
    validateResponse(JSON.stringify({ decisions }), expected, predictions).decisions[0];
  it("accepts only supplied code/system/evidence references", () => {
    expect(parse([valid]).outcome).toBe("matched");
    expect(parse([{ ...valid, evidence: [{ codeIndex: 5, evidenceIndexes: [] }] }]).outcome).toBe(
      "unknown",
    );
    expect(parse([{ ...valid, evidence: [{ codeIndex: 0, evidenceIndexes: [3] }] }]).outcome).toBe(
      "unknown",
    );
    const wrongSystem = expected.map((c) => ({ ...c, system: "snomed" as const }));
    expect(
      validateResponse(JSON.stringify({ decisions: [valid] }), wrongSystem, predictions)
        .decisions[0].outcome,
    ).toBe("unknown");
  });
  it("rejects unknown IDs and invalid envelopes; incomplete and duplicate decisions stay unknown", () => {
    expect(() => validateResponse('{"matched":[]}', expected)).toThrow();
    expect(() => parse([{ ...valid, id: "invented" }])).toThrow();
    expect(parse([]).outcome).toBe("unknown");
    expect(parse([valid, valid]).outcome).toBe("unknown");
    expect(parse([{ ...valid, evidence: undefined }]).outcome).toBe("unknown");
  });
  it("does not accept unrelated exact codes or self as a proper descendant", () => {
    const unrelated = expected.map((c) => ({ ...c, code: "E11.9" }));
    expect(
      validateResponse(JSON.stringify({ decisions: [valid] }), unrelated, predictions).decisions[0]
        .outcome,
    ).toBe("unknown");
    const descendants = expected.map((c) => ({ ...c, op: "descendent-of" }));
    expect(
      validateResponse(JSON.stringify({ decisions: [valid] }), descendants, predictions)
        .decisions[0].outcome,
    ).toBe("unknown");
  });
  it("preserves absence decisions with successful empty predictions", () => {
    const absent = expected.map((c) => ({ ...c, condition: "absent" }));
    const result = validateResponse(
      JSON.stringify({ decisions: [decision("trigger", "icd10", "matched")] }),
      absent,
      { ...predictions, codes: [] },
    );
    expect(result.decisions[0].outcome).toBe("matched");
  });
});

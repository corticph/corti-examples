/**
 * Tests for the nudge engine — grammar-based text matching rule evaluation.
 */
import { describe, expect, it } from "vitest";
import { codeCriteria, criterionId, type EvaluationResponse } from "./evaluation";
import { evaluateRules as evaluateEngine } from "./nudgeEngine";
import { CATALOG, type Icd10Criteria, type NudgeRule, type SnomedCriteria } from "./nudgeRules";

// Compact fixtures for existing rule tests, expanded into explicit v2 decisions.
interface AgentNudgeResponse {
  triggered: string[];
  resolved: string[];
  reasoning: unknown[];
}
interface PromptEvalResponse {
  matched: string[];
  reasoning: unknown[];
}
function evaluateRules(
  text: string,
  rules: NudgeRule[],
  opts?: { agentResult?: AgentNudgeResponse; promptResult?: PromptEvalResponse },
) {
  const agentResult: EvaluationResponse | undefined = opts?.agentResult && {
    decisions: codeCriteria(rules).map((c) => {
      const [ruleId, side] = c.id.split(":");
      return {
        id: c.id,
        outcome: (side === "trigger"
          ? opts.agentResult?.triggered
          : opts.agentResult?.resolved
        )?.includes(ruleId)
          ? "matched"
          : "not-matched",
      };
    }),
  };
  const promptResult: EvaluationResponse | undefined = opts?.promptResult && {
    decisions: rules.flatMap((r) =>
      (["trigger", "resolve"] as const)
        .filter((side) => r[side].prompt)
        .map((side) => ({
          id: criterionId(r.id, side, "prompt"),
          outcome: opts.promptResult?.matched.includes(`${r.id}:${side}`)
            ? "matched"
            : "not-matched",
        })),
    ),
  };
  return evaluateEngine(text, rules, { agentResult, promptResult });
}

function makeRule(
  id: string,
  trigger: {
    conditions?: string[];
    mode?: "all" | "any";
    none?: string[];
    groups?: { name: string; conditions: string[]; mode?: "all" | "any" }[];
    minGroups?: number;
  },
  resolve?: { conditions?: string[]; mode?: "all" | "any" },
): NudgeRule {
  return {
    id,
    title: id,
    message: id,
    enabled: true,
    trigger: {
      textMatch: {
        conditions: trigger.conditions?.map((s) => ({ contains: s })),
        mode: trigger.mode ?? "any",
        none: trigger.none?.map((s) => ({ contains: s })),
        groups: trigger.groups?.map((g) => ({
          name: g.name,
          criteria: {
            conditions: g.conditions.map((s) => ({ contains: s })),
            mode: g.mode ?? "any",
          },
        })),
        minGroups: trigger.minGroups,
      },
    },
    resolve: resolve
      ? {
          textMatch: {
            conditions: resolve.conditions?.map((s) => ({ contains: s })),
            mode: resolve.mode ?? "any",
          },
        }
      : {},
  };
}

describe("evaluateRules — basic text matching", () => {
  it("fires when 'any' matches and 'none' is absent", () => {
    const rules = [makeRule("chf", { conditions: ["CHF"], none: ["systolic", "diastolic"] })];
    const result = evaluateRules("Patient has CHF.", rules);
    expect(result.triggered.has("chf")).toBe(true);
  });

  it("does not fire when 'any' is absent", () => {
    const rules = [makeRule("chf", { conditions: ["CHF"], none: ["systolic", "diastolic"] })];
    const result = evaluateRules("Patient has hypertension.", rules);
    expect(result.triggered.has("chf")).toBe(false);
  });

  it("does not fire when a 'none' term is present", () => {
    const rules = [makeRule("chf", { conditions: ["CHF"], none: ["systolic", "diastolic"] })];
    const result = evaluateRules("Patient has systolic CHF.", rules);
    expect(result.triggered.has("chf")).toBe(false);
  });

  it("resolves when resolve criteria are met", () => {
    const rules = [
      makeRule(
        "chf",
        { conditions: ["CHF"], none: ["systolic", "diastolic"] },
        { conditions: ["systolic", "diastolic"] },
      ),
    ];
    const result = evaluateRules("Patient has systolic CHF.", rules);
    expect(result.triggered.has("chf")).toBe(false);
    expect(result.resolved.has("chf")).toBe(true);
  });

  it("is case-insensitive", () => {
    const rules = [makeRule("chf", { conditions: ["congestive heart failure"] })];
    const result = evaluateRules("Patient has CONGESTIVE HEART FAILURE.", rules);
    expect(result.triggered.has("chf")).toBe(true);
  });

  it("skips disabled rules", () => {
    const rule = makeRule("chf", { conditions: ["CHF"] });
    rule.enabled = false;
    const result = evaluateRules("Patient has CHF.", [rule]);
    expect(result.triggered.has("chf")).toBe(false);
  });

  it("handles empty text", () => {
    const rules = [makeRule("chf", { conditions: ["CHF"] })];
    const result = evaluateRules("", rules);
    expect(result.triggered.size).toBe(0);
  });
});

describe("evaluateRules — grammar syntax", () => {
  it("handles [optional] syntax — matches with optional word", () => {
    const rules = [makeRule("chf", { conditions: ["[congestive] heart failure"] })];
    expect(evaluateRules("Patient has congestive heart failure.", rules).triggered.has("chf")).toBe(
      true,
    );
  });

  it("handles [optional] syntax — matches without optional word", () => {
    const rules = [makeRule("chf", { conditions: ["[congestive] heart failure"] })];
    expect(evaluateRules("Patient has heart failure.", rules).triggered.has("chf")).toBe(true);
  });

  it("handles (A|B|C) alternation in contains", () => {
    const rules = [
      makeRule("chf", {
        conditions: ["CHF"],
        none: ["(systolic|diastolic|combined systolic diastolic)"],
      }),
    ];
    // "systolic" present → none matches → trigger does NOT fire.
    expect(evaluateRules("Patient has systolic CHF.", rules).triggered.has("chf")).toBe(false);
    // "diastolic" present → none matches → trigger does NOT fire.
    expect(evaluateRules("Patient has diastolic CHF.", rules).triggered.has("chf")).toBe(false);
    // "combined systolic diastolic" present → none matches → trigger does NOT fire.
    expect(
      evaluateRules("Patient has combined systolic diastolic CHF.", rules).triggered.has("chf"),
    ).toBe(false);
    // Neither present → trigger fires.
    expect(evaluateRules("Patient has CHF.", rules).triggered.has("chf")).toBe(true);
  });

  it("handles multiple AND-ed groups in one contains", () => {
    const rules = [
      makeRule("chf", {
        conditions: ["CHF"],
        none: ["(systolic|diastolic) (acute|chronic)"],
      }),
    ];
    // Both type and acuity present → none matches → trigger does NOT fire.
    expect(evaluateRules("Patient has acute systolic CHF.", rules).triggered.has("chf")).toBe(
      false,
    );
    // Only type present, no acuity → none does NOT match → trigger fires.
    expect(evaluateRules("Patient has systolic CHF.", rules).triggered.has("chf")).toBe(true);
    // Only acuity present, no type → none does NOT match → trigger fires.
    expect(evaluateRules("Patient has acute CHF.", rules).triggered.has("chf")).toBe(true);
  });

  it("handles {textMatch.conditions} self-reference in resolve", () => {
    const rule: NudgeRule = {
      id: "chf-spec",
      title: "CHF specificity",
      message: "Specify type and acuity",
      enabled: true,
      trigger: {
        textMatch: {
          conditions: [{ contains: "[congestive] heart failure" }, { contains: "CHF" }],
          none: [
            {
              contains:
                "(systolic|diastolic|combined systolic diastolic) (acute|chronic|acute on chronic) (textMatch.conditions)",
            },
          ],
        },
      },
      resolve: {
        textMatch: {
          conditions: [
            {
              contains:
                "(systolic|diastolic|combined systolic diastolic) (acute|chronic|acute on chronic) (textMatch.conditions)",
            },
          ],
        },
      },
    };

    // CHF present, no type or acuity → trigger fires.
    expect(evaluateRules("Patient has CHF.", [rule]).triggered.has("chf-spec")).toBe(true);

    // CHF with type and acuity → trigger does NOT fire, resolve fires.
    const result = evaluateRules("Patient has acute systolic CHF.", [rule]);
    expect(result.triggered.has("chf-spec")).toBe(false);
    expect(result.resolved.has("chf-spec")).toBe(true);

    // Congestive heart failure with type and acuity → resolve fires.
    const result2 = evaluateRules("Patient has chronic diastolic congestive heart failure.", [
      rule,
    ]);
    expect(result2.triggered.has("chf-spec")).toBe(false);
    expect(result2.resolved.has("chf-spec")).toBe(true);

    // Heart failure (without "congestive") with type and acuity → resolve fires.
    const result3 = evaluateRules("Patient has acute systolic heart failure.", [rule]);
    expect(result3.triggered.has("chf-spec")).toBe(false);
    expect(result3.resolved.has("chf-spec")).toBe(true);
  });
});

describe("evaluateRules — groups / minGroups", () => {
  it("fires when minGroups criteria met", () => {
    const rules = [
      makeRule("sepsis", {
        conditions: ["infection"],
        none: ["sepsis"],
        groups: [
          { name: "fever", conditions: ["fever", "temperature 38"] },
          { name: "tachycardia", conditions: ["tachycardia", "heart rate 9"] },
          { name: "WBC", conditions: ["leukocytosis", "WBC 1"] },
        ],
        minGroups: 2,
      }),
    ];

    // Infection + fever + tachycardia (2 groups) → fires.
    expect(
      evaluateRules("Patient has infection with fever and tachycardia.", rules).triggered.has(
        "sepsis",
      ),
    ).toBe(true);

    // Infection + fever only (1 group) → does NOT fire.
    expect(evaluateRules("Patient has infection with fever.", rules).triggered.has("sepsis")).toBe(
      false,
    );

    // Infection + all 3 groups → fires.
    expect(
      evaluateRules(
        "Patient has infection with fever, tachycardia, and leukocytosis.",
        rules,
      ).triggered.has("sepsis"),
    ).toBe(true);

    // No infection → does NOT fire regardless of SIRS criteria.
    expect(
      evaluateRules("Patient has fever, tachycardia, and leukocytosis.", rules).triggered.has(
        "sepsis",
      ),
    ).toBe(false);
  });

  it("does not fire when sepsis already diagnosed", () => {
    const rules = [
      makeRule("sepsis", {
        conditions: ["infection"],
        none: ["sepsis"],
        groups: [
          { name: "fever", conditions: ["fever"] },
          { name: "tachycardia", conditions: ["tachycardia"] },
        ],
        minGroups: 2,
      }),
    ];
    expect(
      evaluateRules(
        "Patient has infection with fever and tachycardia. Diagnosis: sepsis.",
        rules,
      ).triggered.has("sepsis"),
    ).toBe(false);
  });
});

describe("evaluateRules — built-in catalog", () => {
  it("CHF specificity fires for CHF without type/acuity", () => {
    const text = "Patient presents with congestive heart failure.";
    const result = evaluateRules(text, CATALOG);
    expect(result.triggered.has("chf-specificity")).toBe(true);
    expect(result.resolved.has("chf-specificity")).toBe(false);
  });

  it("CHF specificity resolves with type + acuity", () => {
    const text = "Patient has acute systolic congestive heart failure.";
    const result = evaluateRules(text, CATALOG);
    expect(result.triggered.has("chf-specificity")).toBe(false);
    expect(result.resolved.has("chf-specificity")).toBe(true);
  });

  it("CHF specificity does NOT resolve with type only (acuity still missing)", () => {
    const text = "Patient has systolic congestive heart failure.";
    const result = evaluateRules(text, CATALOG);
    expect(result.triggered.has("chf-specificity")).toBe(true);
    expect(result.resolved.has("chf-specificity")).toBe(false);
  });

  it("sepsis fires for infection with 2+ SIRS criteria", () => {
    const text = "Patient admitted with pneumonia. Temperature 38.5C, heart rate 96, WBC 14.2.";
    const result = evaluateRules(text, CATALOG);
    expect(result.triggered.has("sepsis-clarification")).toBe(true);
  });

  it("sepsis does NOT fire with only 1 SIRS criterion", () => {
    const text = "Patient admitted with pneumonia. Temperature 38.5C.";
    const result = evaluateRules(text, CATALOG);
    expect(result.triggered.has("sepsis-clarification")).toBe(false);
  });

  it("sepsis does NOT fire when sepsis already diagnosed", () => {
    const text =
      "Patient admitted with pneumonia. Temperature 38.5C, heart rate 96. Diagnosis: sepsis.";
    const result = evaluateRules(text, CATALOG);
    expect(result.triggered.has("sepsis-clarification")).toBe(false);
    expect(result.resolved.has("sepsis-clarification")).toBe(true);
  });

  it("diabetes-type fires for diabetes without type", () => {
    const result = evaluateRules("Patient has diabetes.", CATALOG);
    expect(result.triggered.has("diabetes-type")).toBe(true);
  });

  it("diabetes-type does NOT fire for type 2 diabetes", () => {
    const result = evaluateRules("Patient has type 2 diabetes.", CATALOG);
    expect(result.triggered.has("diabetes-type")).toBe(false);
    expect(result.resolved.has("diabetes-type")).toBe(true);
  });

  it("evaluates multiple rules independently", () => {
    const text = "Patient has CHF and diabetes.";
    const result = evaluateRules(text, CATALOG);
    expect(result.triggered.has("chf-specificity")).toBe(true);
    expect(result.triggered.has("diabetes-type")).toBe(true);
  });
});

describe("evaluateRules — agent-assisted SNOMED", () => {
  function makeSnomedRule(
    id: string,
    trigger: SnomedCriteria,
    resolve?: SnomedCriteria,
  ): NudgeRule {
    return {
      id,
      title: id,
      message: id,
      enabled: true,
      trigger: { snomed: trigger },
      resolve: resolve ? { snomed: resolve } : {},
    };
  }

  it("fires SNOMED rule when agent returns it as triggered", () => {
    const rule = makeSnomedRule("chf-snomed", {
      conditions: [{ code: "42343007", op: "is-a", condition: "present" }],
      mode: "all",
    });
    const agentResult: AgentNudgeResponse = {
      triggered: ["chf-snomed"],
      resolved: [],
      reasoning: [],
    };
    const result = evaluateRules("Patient has heart failure.", [rule], { agentResult });
    expect(result.triggered.has("chf-snomed")).toBe(true);
  });

  it("does not fire SNOMED rule when agent does not trigger it", () => {
    const rule = makeSnomedRule("chf-snomed", {
      conditions: [{ code: "42343007", op: "is-a", condition: "present" }],
      mode: "all",
    });
    const agentResult: AgentNudgeResponse = {
      triggered: [],
      resolved: [],
      reasoning: [],
    };
    const result = evaluateRules("Patient denies heart failure.", [rule], { agentResult });
    expect(result.triggered.has("chf-snomed")).toBe(false);
  });

  it("resolves SNOMED rule when agent returns it as resolved", () => {
    const rule = makeSnomedRule(
      "chf-snomed",
      {
        conditions: [{ code: "42343007", op: "is-a", condition: "present" }],
        mode: "all",
      },
      {
        conditions: [{ code: "42343007", op: "descendent-of", condition: "present" }],
        mode: "any",
      },
    );
    const agentResult: AgentNudgeResponse = {
      triggered: [],
      resolved: ["chf-snomed"],
      reasoning: [],
    };
    const result = evaluateRules("Patient has acute systolic heart failure.", [rule], {
      agentResult,
    });
    expect(result.triggered.has("chf-snomed")).toBe(false);
    expect(result.resolved.has("chf-snomed")).toBe(true);
  });

  it("does not evaluate SNOMED rule without agent result", () => {
    const rule = makeSnomedRule("chf-snomed", {
      conditions: [{ code: "42343007", op: "is-a", condition: "present" }],
      mode: "all",
    });
    const result = evaluateRules("Patient has heart failure.", [rule]);
    expect(result.triggered.has("chf-snomed")).toBe(false);
  });

  it("mixed text and SNOMED rules evaluate independently with agent", () => {
    const textRule: NudgeRule = {
      id: "chf-text",
      title: "CHF text",
      message: "Specify CHF",
      enabled: true,
      trigger: {
        textMatch: {
          conditions: [{ contains: "CHF" }],
          none: [{ contains: "systolic" }],
        },
      },
      resolve: {},
    };
    const snomedRule = makeSnomedRule("chf-snomed", {
      conditions: [{ code: "42343007", op: "is-a", condition: "present" }],
      mode: "all",
    });
    const agentResult: AgentNudgeResponse = {
      triggered: ["chf-snomed"],
      resolved: [],
      reasoning: [],
    };
    const result = evaluateRules("Patient has CHF.", [textRule, snomedRule], { agentResult });
    expect(result.triggered.has("chf-text")).toBe(true);
    expect(result.triggered.has("chf-snomed")).toBe(true);
  });

  it("skips disabled SNOMED rules even if agent triggers them", () => {
    const rule = makeSnomedRule("chf-snomed", {
      conditions: [{ code: "42343007", op: "is-a", condition: "present" }],
      mode: "all",
    });
    rule.enabled = false;
    const agentResult: AgentNudgeResponse = {
      triggered: ["chf-snomed"],
      resolved: [],
      reasoning: [],
    };
    const result = evaluateRules("Patient has heart failure.", [rule], { agentResult });
    expect(result.triggered.has("chf-snomed")).toBe(false);
  });
});

describe("evaluateRules — agent-assisted ICD-10", () => {
  function makeIcd10Rule(id: string, trigger: Icd10Criteria, resolve?: Icd10Criteria): NudgeRule {
    return {
      id,
      title: id,
      message: id,
      enabled: true,
      trigger: { icd10: trigger },
      resolve: resolve ? { icd10: resolve } : {},
    };
  }

  it("fires ICD-10 rule when agent returns it as triggered", () => {
    const rule = makeIcd10Rule("chf-icd10", {
      conditions: [{ code: "I50", op: "is-a", condition: "present" }],
      mode: "all",
    });
    const agentResult: AgentNudgeResponse = {
      triggered: ["chf-icd10"],
      resolved: [],
      reasoning: [],
    };
    const result = evaluateRules("Patient has heart failure.", [rule], { agentResult });
    expect(result.triggered.has("chf-icd10")).toBe(true);
  });

  it("does not fire ICD-10 rule when agent does not trigger it", () => {
    const rule = makeIcd10Rule("chf-icd10", {
      conditions: [{ code: "I50", op: "is-a", condition: "present" }],
      mode: "all",
    });
    const agentResult: AgentNudgeResponse = {
      triggered: [],
      resolved: [],
      reasoning: [],
    };
    const result = evaluateRules("Patient denies heart failure.", [rule], { agentResult });
    expect(result.triggered.has("chf-icd10")).toBe(false);
  });

  it("resolves ICD-10 rule when agent returns it as resolved", () => {
    const rule = makeIcd10Rule(
      "chf-icd10",
      {
        conditions: [{ code: "I50", op: "is-a", condition: "present" }],
        mode: "all",
      },
      {
        conditions: [{ code: "I50", op: "descendent-of", condition: "present" }],
        mode: "any",
      },
    );
    const agentResult: AgentNudgeResponse = {
      triggered: [],
      resolved: ["chf-icd10"],
      reasoning: [],
    };
    const result = evaluateRules("Patient has acute systolic heart failure.", [rule], {
      agentResult,
    });
    expect(result.triggered.has("chf-icd10")).toBe(false);
    expect(result.resolved.has("chf-icd10")).toBe(true);
  });

  it("does not evaluate ICD-10 rule without agent result", () => {
    const rule = makeIcd10Rule("chf-icd10", {
      conditions: [{ code: "I50", op: "is-a", condition: "present" }],
      mode: "all",
    });
    const result = evaluateRules("Patient has heart failure.", [rule]);
    expect(result.triggered.has("chf-icd10")).toBe(false);
  });

  it("combined SNOMED and ICD-10 rules evaluate via same agent result", () => {
    const snomedRule: NudgeRule = {
      id: "chf-snomed",
      title: "CHF SNOMED",
      message: "Specify CHF",
      enabled: true,
      trigger: {
        snomed: {
          conditions: [{ code: "42343007", op: "is-a", condition: "present" }],
          mode: "all",
        },
      },
      resolve: {},
    };
    const icd10Rule = makeIcd10Rule("chf-icd10", {
      conditions: [{ code: "I50", op: "is-a", condition: "present" }],
      mode: "all",
    });
    const agentResult: AgentNudgeResponse = {
      triggered: ["chf-snomed", "chf-icd10"],
      resolved: [],
      reasoning: [],
    };
    const result = evaluateRules("Patient has CHF.", [snomedRule, icd10Rule], { agentResult });
    expect(result.triggered.has("chf-snomed")).toBe(true);
    expect(result.triggered.has("chf-icd10")).toBe(true);
  });

  it("mixed text and ICD-10 rules evaluate independently with agent", () => {
    const textRule: NudgeRule = {
      id: "chf-text",
      title: "CHF text",
      message: "Specify CHF",
      enabled: true,
      trigger: {
        textMatch: {
          conditions: [{ contains: "CHF" }],
          none: [{ contains: "systolic" }],
        },
      },
      resolve: {},
    };
    const icd10Rule = makeIcd10Rule("chf-icd10", {
      conditions: [{ code: "I50", op: "is-a", condition: "present" }],
      mode: "all",
    });
    const agentResult: AgentNudgeResponse = {
      triggered: ["chf-icd10"],
      resolved: [],
      reasoning: [],
    };
    const result = evaluateRules("Patient has CHF.", [textRule, icd10Rule], { agentResult });
    expect(result.triggered.has("chf-text")).toBe(true);
    expect(result.triggered.has("chf-icd10")).toBe(true);
  });

  it("skips disabled ICD-10 rules even if agent triggers them", () => {
    const rule = makeIcd10Rule("chf-icd10", {
      conditions: [{ code: "I50", op: "is-a", condition: "present" }],
      mode: "all",
    });
    rule.enabled = false;
    const agentResult: AgentNudgeResponse = {
      triggered: ["chf-icd10"],
      resolved: [],
      reasoning: [],
    };
    const result = evaluateRules("Patient has heart failure.", [rule], { agentResult });
    expect(result.triggered.has("chf-icd10")).toBe(false);
  });

  it("ICD-10 + text cross-criteria AND mode requires both", () => {
    const rule: NudgeRule = {
      id: "mixed-icd10-text",
      title: "Mixed",
      message: "msg",
      enabled: true,
      trigger: {
        textMatch: {
          conditions: [{ contains: "CHF" }],
        },
        icd10: {
          conditions: [{ code: "I50", op: "is-a", condition: "present" }],
          mode: "all",
        },
        mode: "all",
      },
      resolve: {},
    };
    // Agent triggers the ICD-10 part, text matches → both AND → triggered
    const agentResult: AgentNudgeResponse = {
      triggered: ["mixed-icd10-text"],
      resolved: [],
      reasoning: [],
    };
    const result = evaluateRules("Patient has CHF.", [rule], { agentResult });
    expect(result.triggered.has("mixed-icd10-text")).toBe(true);
  });

  it("ICD-10 + text cross-criteria AND mode fails when text doesn't match", () => {
    const rule: NudgeRule = {
      id: "mixed-icd10-text",
      title: "Mixed",
      message: "msg",
      enabled: true,
      trigger: {
        textMatch: {
          conditions: [{ contains: "CHF" }],
        },
        icd10: {
          conditions: [{ code: "I50", op: "is-a", condition: "present" }],
          mode: "all",
        },
        mode: "all",
      },
      resolve: {},
    };
    const agentResult: AgentNudgeResponse = {
      triggered: ["mixed-icd10-text"],
      resolved: [],
      reasoning: [],
    };
    const result = evaluateRules("Patient has diabetes.", [rule], { agentResult });
    expect(result.triggered.has("mixed-icd10-text")).toBe(false);
  });
});

describe("evaluateRules — prompt criteria", () => {
  function makePromptRule(
    id: string,
    triggerPrompt: string,
    resolvePrompt?: string,
    mode?: "all" | "any",
  ): NudgeRule {
    return {
      id,
      title: id,
      message: id,
      enabled: true,
      trigger: { prompt: { prompt: triggerPrompt }, mode },
      resolve: resolvePrompt ? { prompt: { prompt: resolvePrompt }, mode } : {},
    };
  }

  it("fires when prompt evaluator matches trigger", () => {
    const rule = makePromptRule("prompt-rule", "Check if CHF is documented without EF");
    const promptResult: PromptEvalResponse = {
      matched: ["prompt-rule:trigger"],
      reasoning: [],
    };
    const result = evaluateRules("Patient has CHF.", [rule], { promptResult });
    expect(result.triggered.has("prompt-rule")).toBe(true);
  });

  it("does not fire when prompt evaluator does not match", () => {
    const rule = makePromptRule("prompt-rule", "Check if CHF is documented without EF");
    const promptResult: PromptEvalResponse = {
      matched: [],
      reasoning: [],
    };
    const result = evaluateRules("Patient has CHF.", [rule], { promptResult });
    expect(result.triggered.has("prompt-rule")).toBe(false);
  });

  it("does not fire when no promptResult is provided", () => {
    const rule = makePromptRule("prompt-rule", "Check if CHF is documented without EF");
    const result = evaluateRules("Patient has CHF.", [rule]);
    expect(result.triggered.has("prompt-rule")).toBe(false);
  });

  it("resolves when prompt evaluator matches resolve criteria", () => {
    const rule = makePromptRule(
      "prompt-rule",
      "Check if CHF documented",
      "Check if EF is documented",
    );
    const promptResult: PromptEvalResponse = {
      matched: ["prompt-rule:resolve"],
      reasoning: [],
    };
    const result = evaluateRules("Patient has CHF. EF 38%.", [rule], { promptResult });
    expect(result.resolved.has("prompt-rule")).toBe(true);
  });
});

describe("evaluateRules — cross-criteria mode (text + prompt)", () => {
  it("AND mode: both text and prompt must match", () => {
    const rule: NudgeRule = {
      id: "combined",
      title: "combined",
      message: "combined",
      enabled: true,
      trigger: {
        textMatch: { conditions: [{ contains: "CHF" }], mode: "any" },
        prompt: { prompt: "Check if EF is missing" },
        mode: "all",
      },
      resolve: {},
    };

    // Both match → fires
    const result1 = evaluateRules("Patient has CHF.", [rule], {
      promptResult: { matched: ["combined:trigger"], reasoning: [] },
    });
    expect(result1.triggered.has("combined")).toBe(true);

    // Text matches but prompt doesn't → does not fire (AND)
    const result2 = evaluateRules("Patient has CHF.", [rule], {
      promptResult: { matched: [], reasoning: [] },
    });
    expect(result2.triggered.has("combined")).toBe(false);

    // Prompt matches but text doesn't → does not fire (AND)
    const result3 = evaluateRules("Patient has hypertension.", [rule], {
      promptResult: { matched: ["combined:trigger"], reasoning: [] },
    });
    expect(result3.triggered.has("combined")).toBe(false);
  });

  it("OR mode: either text or prompt matching is enough", () => {
    const rule: NudgeRule = {
      id: "combined-or",
      title: "combined-or",
      message: "combined-or",
      enabled: true,
      trigger: {
        textMatch: { conditions: [{ contains: "CHF" }], mode: "any" },
        prompt: { prompt: "Check if EF is missing" },
        mode: "any",
      },
      resolve: {},
    };

    // Text matches, prompt doesn't → fires (OR)
    const result = evaluateRules("Patient has CHF.", [rule], {
      promptResult: { matched: [], reasoning: [] },
    });
    expect(result.triggered.has("combined-or")).toBe(true);

    // Text doesn't match, prompt matches → fires (OR)
    const result2 = evaluateRules("Patient has hypertension.", [rule], {
      promptResult: { matched: ["combined-or:trigger"], reasoning: [] },
    });
    expect(result2.triggered.has("combined-or")).toBe(true);
  });

  it("defaults to AND when mode is not specified", () => {
    const rule: NudgeRule = {
      id: "default-mode",
      title: "default-mode",
      message: "default-mode",
      enabled: true,
      trigger: {
        textMatch: { conditions: [{ contains: "CHF" }], mode: "any" },
        prompt: { prompt: "Check if EF is missing" },
      },
      resolve: {},
    };

    // Text matches but prompt doesn't → does not fire (default AND)
    const result = evaluateRules("Patient has CHF.", [rule], {
      promptResult: { matched: [], reasoning: [] },
    });
    expect(result.triggered.has("default-mode")).toBe(false);
  });
});

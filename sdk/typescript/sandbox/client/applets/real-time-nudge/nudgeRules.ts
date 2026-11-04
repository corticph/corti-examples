/**
 * Nudge rule model + persistence. A nudge rule is a documentation-completeness
 * check: when the trigger criteria are met and the resolve criteria are not,
 * the nudge fires and surfaces a non-blocking message to the clinician.
 *
 * Text matching uses conditions/none groups on the editor text. The rule
 * model also supports SNOMED-CT and ICD-10-CM code criteria (agent-assisted),
 * legacy client-side SNOMED-CT code criteria, and custom prompt criteria.
 *
 * Rules persist per API client (clientId:tenant) via the same ConfigStore /
 * RuleStore pattern as replacements and terms. A catalog of 10 clinically
 * meaningful seed rules is always merged in and cannot be removed.
 */
import { createRuleStore, type RuleBase } from "../_shared/ruleStore";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface TextCondition {
  /** Case-insensitive substring match. */
  contains: string;
  /** Optional regex pattern (stored, not currently evaluated). */
  pattern?: string;
}

export interface TextMatchCriteria {
  /** Conditions to evaluate. `mode` controls AND vs OR. */
  conditions?: TextCondition[];
  /** `all` = every condition must match (AND); `any` = at least one (OR). */
  mode?: "all" | "any";
  /** NONE may match (NOT — exclusion list). */
  none?: TextCondition[];
  /**
   * Named criterion groups — each is evaluated independently as its own
   * TextMatchCriteria. `minGroups` sets how many must match (default:
   * all). Used for count-based criteria like "2+ SIRS criteria present."
   */
  groups?: { name: string; criteria: TextMatchCriteria }[];
  minGroups?: number;
}

/* ------------------------------------------------------------------ */
/* Agent-assisted code criteria (SNOMED-CT + ICD-10-CM)                */
/* ------------------------------------------------------------------ */

export type CodeOp = "=" | "is-a" | "descendent-of";
export type CodeCondition = "present" | "absent";

export interface CodeConditionEntry {
  /** Code ID (SNOMED-CT or ICD-10-CM). */
  code: string;
  /** Hierarchy operator: `=` (exact), `is-a`, or `descendent-of`. */
  op: CodeOp;
  /** Whether the code (or its descendants) must be present or absent. */
  condition: CodeCondition;
}

export interface CodeCriteria {
  /** Conditions to evaluate. Each has a code, operator, and present/absent. */
  conditions: CodeConditionEntry[];
  /** `all` = every condition must match; `any` = at least one must match. */
  mode: "all" | "any";
}

/** SNOMED-CT agent-assisted criteria. */
export type SnomedCriteria = CodeCriteria;
export type SnomedCodeCondition = CodeConditionEntry;
export type SnomedOp = CodeOp;
export type SnomedCondition = CodeCondition;

/** ICD-10-CM agent-assisted criteria. */
export type Icd10Criteria = CodeCriteria;
export type Icd10CodeCondition = CodeConditionEntry;
export type Icd10Op = CodeOp;
export type Icd10Condition = CodeCondition;

export interface PromptCriteria {
  /** Custom evaluation instructions for the prompt evaluator agent (max 500 chars). */
  prompt: string;
}

export interface RuleCriteria {
  /** Text matching. */
  textMatch?: TextMatchCriteria;
  /** SNOMED-CT agent-assisted criteria (hierarchy-aware, contextual). */
  snomed?: SnomedCriteria;
  /** Custom agent prompt criteria (AI-evaluated against note text). */
  prompt?: PromptCriteria;
  /** ICD-10-CM agent-assisted criteria (hierarchy-aware, contextual). */
  icd10?: Icd10Criteria;
  /** How the present criteria types combine. Default: "all" (AND). */
  mode?: "all" | "any";
}

export interface NudgeRule extends RuleBase {
  title: string;
  message: string;
  trigger: RuleCriteria;
  resolve: RuleCriteria;
  enabled: boolean;
}

/* ------------------------------------------------------------------ */
/* Seed catalog                                                        */
/* ------------------------------------------------------------------ */

export const CATALOG: NudgeRule[] = [
  {
    id: "chf-specificity",
    title: "Heart Failure (text)",
    message:
      "Heart failure is documented without type (systolic or diastolic) or acuity (acute, chronic, or acute on chronic). Please specify the type and acuity.",
    trigger: {
      textMatch: {
        conditions: [{ contains: "[congestive] heart failure" }, { contains: "CHF" }],
        mode: "any",
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
        mode: "any",
      },
    },
    enabled: true,
    builtin: true,
  },
  {
    id: "chf-specificity-snomed",
    title: "Heart Failure (SNOMED)",
    message:
      "Heart failure is documented without specification of a specific subtype. Please specify type and acuity.",
    trigger: {
      snomed: {
        conditions: [
          { code: "84114007", op: "=", condition: "present" },
          { code: "84114007", op: "descendent-of", condition: "absent" },
        ],
        mode: "all",
      },
    },
    resolve: {
      snomed: {
        conditions: [{ code: "84114007", op: "descendent-of", condition: "present" }],
        mode: "any",
      },
    },
    enabled: true,
    builtin: true,
  },
  {
    id: "chf-specificity-icd10",
    title: "Heart Failure (ICD-10)",
    message:
      "Heart failure is documented without a specific ICD-10-CM subtype. Please specify the type and acuity (e.g. I50.23 — acute systolic (congestive) heart failure).",
    trigger: {
      icd10: {
        conditions: [
          { code: "I50.9", op: "=", condition: "present" },
          { code: "I50.21", op: "=", condition: "absent" },
          { code: "I50.22", op: "=", condition: "absent" },
          { code: "I50.23", op: "=", condition: "absent" },
          { code: "I50.31", op: "=", condition: "absent" },
          { code: "I50.32", op: "=", condition: "absent" },
          { code: "I50.33", op: "=", condition: "absent" },
          { code: "I50.41", op: "=", condition: "absent" },
          { code: "I50.42", op: "=", condition: "absent" },
          { code: "I50.43", op: "=", condition: "absent" },
        ],
        mode: "all",
      },
    },
    resolve: {
      icd10: {
        conditions: [
          { code: "I50.21", op: "=", condition: "present" },
          { code: "I50.22", op: "=", condition: "present" },
          { code: "I50.23", op: "=", condition: "present" },
          { code: "I50.31", op: "=", condition: "present" },
          { code: "I50.32", op: "=", condition: "present" },
          { code: "I50.33", op: "=", condition: "present" },
          { code: "I50.41", op: "=", condition: "present" },
          { code: "I50.42", op: "=", condition: "present" },
          { code: "I50.43", op: "=", condition: "present" },
        ],
        mode: "any",
      },
    },
    enabled: true,
    builtin: true,
  },
  {
    id: "diabetes-type",
    title: "Diabetes type unspecified",
    message: "Diabetes is documented without type (type 1 or type 2). Please specify the type.",
    trigger: {
      textMatch: {
        conditions: [{ contains: "diabetes" }, { contains: "diabetic" }],
        mode: "any",
        none: [{ contains: "(type 1|type I|type 2|type II|gestational) (textMatch.conditions)" }],
      },
    },
    resolve: {
      textMatch: {
        conditions: [
          { contains: "(type 1|type I|type 2|type II|gestational) (textMatch.conditions)" },
        ],
        mode: "any",
      },
    },
    enabled: true,
    builtin: true,
  },
  {
    id: "anemia-specification",
    title: "Anemia type unspecified",
    message:
      "Anemia is documented without etiology (iron deficiency, chronic disease, hemolytic, aplastic, etc.). Please specify the type.",
    trigger: {
      textMatch: {
        conditions: [{ contains: "anemia" }, { contains: "anemic" }],
        mode: "any",
        none: [
          {
            contains:
              "(iron deficiency|chronic disease|hemolytic|aplastic|sickle cell|normocytic) (textMatch.conditions)",
          },
        ],
      },
    },
    resolve: {
      textMatch: {
        conditions: [
          {
            contains:
              "(iron deficiency|chronic disease|hemolytic|aplastic|sickle cell|normocytic) (textMatch.conditions)",
          },
        ],
        mode: "any",
      },
    },
    enabled: true,
    builtin: true,
  },
  {
    id: "sepsis-clarification",
    title: "Sepsis clarification",
    message:
      "Documentation indicates infection with two or more SIRS criteria present, without a diagnosis of sepsis. Based on the clinical picture, can you further specify the patient's condition (sepsis, severe sepsis, septic shock, or SIRS without sepsis)? Dismiss if clinically undetermined.",
    trigger: {
      textMatch: {
        conditions: [
          { contains: "UTI" },
          { contains: "pneumonia" },
          { contains: "cellulitis" },
          { contains: "bacteremia" },
          { contains: "infection" },
        ],
        mode: "any",
        none: [
          { contains: "sepsis" },
          { contains: "severe sepsis" },
          { contains: "septic shock" },
          { contains: "SIRS" },
        ],
        groups: [
          {
            name: "Temperature",
            criteria: {
              conditions: [
                { contains: "fever" },
                { contains: "temperature 38" },
                { contains: "temperature 39" },
                { contains: "hypothermia" },
                { contains: "temperature 36" },
                { contains: "afebrile" },
              ],
              mode: "any",
            },
          },
          {
            name: "Tachycardia",
            criteria: {
              conditions: [
                { contains: "tachycardia" },
                { contains: "heart rate 9" },
                { contains: "heart rate 10" },
                { contains: "heart rate 11" },
                { contains: "HR 9" },
                { contains: "HR 10" },
                { contains: "HR 11" },
              ],
              mode: "any",
            },
          },
          {
            name: "Tachypnea",
            criteria: {
              conditions: [
                { contains: "tachypnea" },
                { contains: "respiratory rate 2" },
                { contains: "respiratory rate 3" },
                { contains: "RR 2" },
                { contains: "RR 3" },
              ],
              mode: "any",
            },
          },
          {
            name: "WBC abnormality",
            criteria: {
              conditions: [
                { contains: "leukocytosis" },
                { contains: "leukopenia" },
                { contains: "WBC 1" },
                { contains: "WBC 2" },
                { contains: "WBC 3" },
                { contains: "WBC 4" },
                { contains: "bands" },
              ],
              mode: "any",
            },
          },
        ],
        minGroups: 2,
      },
    },
    resolve: {
      textMatch: {
        conditions: [
          { contains: "sepsis" },
          { contains: "severe sepsis" },
          { contains: "septic shock" },
          { contains: "SIRS" },
        ],
        mode: "any",
      },
    },
    enabled: true,
    builtin: true,
  },
  {
    id: "ckd-stage",
    title: "CKD stage unspecified",
    message:
      "Chronic kidney disease is documented without a stage (stage 1–5 or unspecified). Please specify the stage.",
    trigger: {
      textMatch: {
        conditions: [{ contains: "(CKD|chronic kidney disease)" }],
        mode: "any",
        none: [
          {
            contains:
              "(stage 1|stage 2|stage 3|stage 4|stage 5|stage I|stage II|stage III|stage IV|stage V|end-stage|esrd|ESRD) (textMatch.conditions)",
          },
        ],
      },
    },
    resolve: {
      textMatch: {
        conditions: [
          {
            contains:
              "(stage 1|stage 2|stage 3|stage 4|stage 5|stage I|stage II|stage III|stage IV|stage V|end-stage|esrd|ESRD) (textMatch.conditions)",
          },
        ],
        mode: "any",
      },
    },
    enabled: true,
    builtin: true,
  },
  {
    id: "ckd-snomed",
    title: "CKD (SNOMED)",
    message:
      "Chronic kidney disease is documented without a specific SNOMED-CT subtype. Please specify the stage.",
    trigger: {
      snomed: {
        conditions: [
          { code: "709044004", op: "=", condition: "present" },
          { code: "709044004", op: "descendent-of", condition: "absent" },
        ],
        mode: "all",
      },
    },
    resolve: {
      snomed: {
        conditions: [{ code: "709044004", op: "descendent-of", condition: "present" }],
        mode: "any",
      },
    },
    enabled: true,
    builtin: true,
  },
  {
    id: "ckd-icd10",
    title: "CKD (ICD-10)",
    message:
      "Chronic kidney disease is documented without a specific ICD-10-CM stage code. Please specify the stage (e.g. N18.3 — chronic kidney disease, stage 3).",
    trigger: {
      icd10: {
        conditions: [
          { code: "N18.9", op: "=", condition: "present" },
          { code: "N18.1", op: "=", condition: "absent" },
          { code: "N18.2", op: "=", condition: "absent" },
          { code: "N18.3", op: "=", condition: "absent" },
          { code: "N18.4", op: "=", condition: "absent" },
          { code: "N18.5", op: "=", condition: "absent" },
          { code: "N18.6", op: "=", condition: "absent" },
        ],
        mode: "all",
      },
    },
    resolve: {
      icd10: {
        conditions: [
          { code: "N18.1", op: "=", condition: "present" },
          { code: "N18.2", op: "=", condition: "present" },
          { code: "N18.3", op: "=", condition: "present" },
          { code: "N18.4", op: "=", condition: "present" },
          { code: "N18.5", op: "=", condition: "present" },
          { code: "N18.6", op: "=", condition: "present" },
        ],
        mode: "any",
      },
    },
    enabled: true,
    builtin: true,
  },
  {
    id: "hello-fellow-agent",
    title: "Hello, fellow agent",
    message: "",
    trigger: {
      prompt: {
        prompt:
          'If the note contains "hello world" or "what can you do", match this criterion. Generate a fun, encouraging message for the clinician — something like "Let\'s get documenting!" or "Here to help as you need it!" or "Let\'s blast the errors!" so they know you\'re listening and ready to go.',
      },
    },
    resolve: {},
    enabled: true,
    builtin: true,
  },
];

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const nudgeRuleStore = createRuleStore<NudgeRule>("nudgeRules.user", CATALOG);

export function toExport(items: NudgeRule[]) {
  return {
    type: "nudge-rules",
    rules: items.map(({ title, message, trigger, resolve, enabled }) => ({
      title,
      message,
      trigger,
      resolve,
      enabled,
    })),
  };
}

/**
 * NudgeRuleEditor — structured query builder for nudge rules.
 *
 * Features:
 *
 * - Collapsible trigger/resolve sections.
 * - Text criteria: add/remove rows for "any" and "none" conditions.
 * - SNOMED criteria: condition table with code, operator dropdown
 *   (=, is-a, descendent-of), present/absent toggle, mode selector (all/any),
 *   and add/remove rows.
 * - Multiple conditions per trigger/resolve (not just one).
 * - Export/remove with built-in protection.
 */

import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadJson } from "../_shared/utils";
import type {
  Icd10CodeCondition,
  Icd10Condition,
  Icd10Criteria,
  Icd10Op,
  NudgeRule,
  PromptCriteria,
  RuleCriteria,
  SnomedCodeCondition,
  SnomedCondition,
  SnomedCriteria,
  SnomedOp,
  TextCondition,
  TextMatchCriteria,
} from "./nudgeRules";
import { toExport } from "./nudgeRules";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const SNOMED_OPS: SnomedOp[] = ["=", "is-a", "descendent-of"];
const SNOMED_CONDITIONS: SnomedCondition[] = ["present", "absent"];
const ICD10_OPS: Icd10Op[] = ["=", "is-a", "descendent-of"];
const ICD10_CONDITIONS: Icd10Condition[] = ["present", "absent"];

function emptyTextCondition(): TextCondition {
  return { contains: "" };
}

function emptySnomedCondition(): SnomedCodeCondition {
  return { code: "", op: "is-a", condition: "present" };
}

function emptyIcd10Condition(): Icd10CodeCondition {
  return { code: "", op: "is-a", condition: "present" };
}

function cloneCriteria(c: RuleCriteria): RuleCriteria {
  return JSON.parse(JSON.stringify(c)) as RuleCriteria;
}

/* ------------------------------------------------------------------ */
/* Text criteria editor                                                */
/* ------------------------------------------------------------------ */

function TextCriteriaEditor({
  label,
  criteria,
  onChange,
  readOnly = false,
}: {
  label: string;
  criteria: TextMatchCriteria;
  onChange: (next: TextMatchCriteria) => void;
  readOnly?: boolean;
}) {
  const mode = criteria.mode ?? "any";

  const updateCondition = (i: number, value: string) => {
    const conditions = [...(criteria.conditions ?? [])];
    conditions[i] = { contains: value };
    onChange({ ...criteria, conditions });
  };

  const addCondition = () => {
    onChange({ ...criteria, conditions: [...(criteria.conditions ?? []), emptyTextCondition()] });
  };

  const removeCondition = (i: number) => {
    const conditions = [...(criteria.conditions ?? [])];
    conditions.splice(i, 1);
    onChange({ ...criteria, conditions });
  };

  const updateNone = (i: number, value: string) => {
    const none = [...(criteria.none ?? [])];
    none[i] = { contains: value };
    onChange({ ...criteria, none });
  };

  const addNone = () => {
    onChange({ ...criteria, none: [...(criteria.none ?? []), emptyTextCondition()] });
  };

  const removeNone = (i: number) => {
    const none = [...(criteria.none ?? [])];
    none.splice(i, 1);
    onChange({ ...criteria, none });
  };

  const conditions = criteria.conditions ?? [];
  const none = criteria.none ?? [];

  if (readOnly) {
    const parts: string[] = [];
    if (conditions.length > 0) {
      const joiner = mode === "all" ? " AND " : " OR ";
      parts.push(conditions.map((c) => c.contains).join(joiner));
    }
    if (none.length > 0) {
      parts.push(`NOT (${none.map((c) => c.contains).join(" | ")})`);
    }
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {parts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No text conditions.</p>
        ) : (
          <p className="rounded-md border border-border bg-muted/30 px-2 py-1.5 font-mono text-xs text-foreground">
            {parts.join(" · ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Mode:</span>
          <select
            value={mode}
            onChange={(e) => onChange({ ...criteria, mode: e.target.value as "all" | "any" })}
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs outline-none focus:border-corti-lime"
          >
            <option value="any">any (OR)</option>
            <option value="all">all (AND)</option>
          </select>
        </div>
      </div>

      {/* Conditions (OR or AND depending on mode) */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          {mode === "all" ? "All must match (AND)" : "Any must match (OR)"}
        </span>
        {(criteria.conditions ?? []).map((cond, i) => {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: dynamic rows, no reordering
            <div key={`cond-${i}`} className="flex items-center gap-1">
              <input
                value={cond.contains}
                onChange={(e) => updateCondition(i, e.target.value)}
                placeholder="e.g. [congestive] heart failure"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime"
              />
              <button
                type="button"
                onClick={() => removeCondition(i)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Remove condition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={addCondition}
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Add condition
        </button>
      </div>

      {/* None (exclusion list) */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">None of (NOT — none may match)</span>
        {(criteria.none ?? []).map((cond, i) => {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: dynamic rows, no reordering
            <div key={`none-${i}`} className="flex items-center gap-1">
              <input
                value={cond.contains}
                onChange={(e) => updateNone(i, e.target.value)}
                placeholder="e.g. (systolic|diastolic) (acute|chronic)"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime"
              />
              <button
                type="button"
                onClick={() => removeNone(i)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Remove condition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={addNone}
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Add "none" condition
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SNOMED criteria editor                                              */
/* ------------------------------------------------------------------ */

function SnomedCriteriaEditor({
  label,
  criteria,
  onChange,
  readOnly = false,
}: {
  label: string;
  criteria: SnomedCriteria;
  onChange: (next: SnomedCriteria) => void;
  readOnly?: boolean;
}) {
  const updateCondition = (i: number, patch: Partial<SnomedCodeCondition>) => {
    const conditions = [...criteria.conditions];
    conditions[i] = { ...conditions[i], ...patch };
    onChange({ ...criteria, conditions });
  };

  const addCondition = () => {
    onChange({ ...criteria, conditions: [...criteria.conditions, emptySnomedCondition()] });
  };

  const removeCondition = (i: number) => {
    const conditions = [...criteria.conditions];
    conditions.splice(i, 1);
    onChange({ ...criteria, conditions });
  };

  if (readOnly) {
    if (criteria.conditions.length === 0) {
      return null;
    }
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <div className="flex flex-col gap-0.5">
          {criteria.conditions.map((cond) => (
            <p
              key={cond.code}
              className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-xs text-foreground"
            >
              {cond.code} {cond.op} {cond.condition}
            </p>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          Mode: {criteria.mode === "all" ? "all (AND)" : "any (OR)"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Mode:</span>
          <select
            value={criteria.mode}
            onChange={(e) => onChange({ ...criteria, mode: e.target.value as "all" | "any" })}
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs outline-none focus:border-corti-lime"
          >
            <option value="all">all (AND)</option>
            <option value="any">any (OR)</option>
          </select>
        </div>
      </div>

      {criteria.conditions.length === 0 && (
        <p className="text-xs text-muted-foreground">No SNOMED conditions yet.</p>
      )}

      {criteria.conditions.map((cond, i) => {
        const rowClass =
          "flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: dynamic rows, no reordering
          <div key={`snomed-${i}`} className={rowClass}>
            <input
              value={cond.code}
              onChange={(e) => updateCondition(i, { code: e.target.value })}
              placeholder="SNOMED code (e.g. 42343007)"
              className="w-40 rounded border border-border bg-background px-1.5 py-0.5 text-sm outline-none focus:border-corti-lime"
            />
            <select
              value={cond.op}
              onChange={(e) => updateCondition(i, { op: e.target.value as SnomedOp })}
              className="rounded border border-border bg-background px-1.5 py-0.5 text-xs outline-none focus:border-corti-lime"
            >
              {SNOMED_OPS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <select
              value={cond.condition}
              onChange={(e) => updateCondition(i, { condition: e.target.value as SnomedCondition })}
              className="rounded border border-border bg-background px-1.5 py-0.5 text-xs outline-none focus:border-corti-lime"
            >
              {SNOMED_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeCondition(i)}
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Remove condition"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addCondition}
        className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> Add SNOMED condition
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ICD-10 criteria editor                                               */
/* ------------------------------------------------------------------ */

function Icd10CriteriaEditor({
  label,
  criteria,
  onChange,
  readOnly = false,
}: {
  label: string;
  criteria: Icd10Criteria;
  onChange: (next: Icd10Criteria) => void;
  readOnly?: boolean;
}) {
  const updateCondition = (i: number, patch: Partial<Icd10CodeCondition>) => {
    const conditions = [...criteria.conditions];
    conditions[i] = { ...conditions[i], ...patch };
    onChange({ ...criteria, conditions });
  };

  const addCondition = () => {
    onChange({ ...criteria, conditions: [...criteria.conditions, emptyIcd10Condition()] });
  };

  const removeCondition = (i: number) => {
    const conditions = [...criteria.conditions];
    conditions.splice(i, 1);
    onChange({ ...criteria, conditions });
  };

  if (readOnly) {
    if (criteria.conditions.length === 0) {
      return null;
    }
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <div className="flex flex-col gap-0.5">
          {criteria.conditions.map((cond) => (
            <p
              key={cond.code}
              className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-xs text-foreground"
            >
              {cond.code} {cond.op} {cond.condition}
            </p>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          Mode: {criteria.mode === "all" ? "all (AND)" : "any (OR)"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Mode:</span>
          <select
            value={criteria.mode}
            onChange={(e) => onChange({ ...criteria, mode: e.target.value as "all" | "any" })}
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs outline-none focus:border-corti-lime"
          >
            <option value="all">all (AND)</option>
            <option value="any">any (OR)</option>
          </select>
        </div>
      </div>

      {criteria.conditions.length === 0 && (
        <p className="text-xs text-muted-foreground">No ICD-10 conditions yet.</p>
      )}

      {criteria.conditions.map((cond, i) => {
        const rowClass =
          "flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: dynamic rows, no reordering
          <div key={`icd10-${i}`} className={rowClass}>
            <input
              value={cond.code}
              onChange={(e) => updateCondition(i, { code: e.target.value })}
              placeholder="ICD-10 code (e.g. I50.23)"
              className="w-40 rounded border border-border bg-background px-1.5 py-0.5 text-sm outline-none focus:border-corti-lime"
            />
            <select
              value={cond.op}
              onChange={(e) => updateCondition(i, { op: e.target.value as Icd10Op })}
              className="rounded border border-border bg-background px-1.5 py-0.5 text-xs outline-none focus:border-corti-lime"
            >
              {ICD10_OPS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <select
              value={cond.condition}
              onChange={(e) => updateCondition(i, { condition: e.target.value as Icd10Condition })}
              className="rounded border border-border bg-background px-1.5 py-0.5 text-xs outline-none focus:border-corti-lime"
            >
              {ICD10_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeCondition(i)}
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Remove condition"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addCondition}
        className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> Add ICD-10 condition
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Prompt criteria editor                                              */
/* ------------------------------------------------------------------ */

const PROMPT_MAX = 500;

function PromptCriteriaEditor({
  label,
  criteria,
  onChange,
  readOnly = false,
}: {
  label: string;
  criteria: PromptCriteria;
  onChange: (next: PromptCriteria) => void;
  readOnly?: boolean;
}) {
  if (readOnly) {
    if (!criteria.prompt.trim()) {
      return null;
    }
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <p className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs text-foreground">
          {criteria.prompt}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <textarea
        value={criteria.prompt}
        onChange={(e) => onChange({ prompt: e.target.value.slice(0, PROMPT_MAX) })}
        placeholder="e.g. Check if the note documents heart failure without mentioning EF percentage or acuity"
        rows={3}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          Evaluated by an AI agent against the note text. This is a condition to check, not an
          instruction.
        </span>
        <span className="text-[10px] text-muted-foreground">
          {criteria.prompt.length}/{PROMPT_MAX}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Collapsible criteria section                                         */
/* ------------------------------------------------------------------ */

function CriteriaSection({
  title,
  criteria,
  onChange,
  readOnly = false,
}: {
  title: string;
  criteria: RuleCriteria;
  onChange: (next: RuleCriteria) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(true);

  const hasText = !!criteria.textMatch;
  const hasSnomed = !!criteria.snomed;
  const hasIcd10 = !!criteria.icd10;
  const hasPrompt = !!criteria.prompt;
  const summary =
    [hasText && "text", hasSnomed && "SNOMED", hasIcd10 && "ICD-10", hasPrompt && "prompt"]
      .filter(Boolean)
      .join(" + ") || "empty";

  const availableToAdd: { label: string; key: "text" | "snomed" | "icd10" | "prompt" }[] = [];
  if (!hasText) {
    availableToAdd.push({ label: "Text matching", key: "text" });
  }
  if (!hasSnomed) {
    availableToAdd.push({ label: "SNOMED criteria", key: "snomed" });
  }
  if (!hasIcd10) {
    availableToAdd.push({ label: "ICD-10 criteria", key: "icd10" });
  }
  if (!hasPrompt) {
    availableToAdd.push({ label: "Custom prompt", key: "prompt" });
  }

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">({summary})</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
          {/* Text matching component */}
          {hasText && (
            <div className="rounded-md border border-border bg-background p-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Text matching
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...criteria, textMatch: undefined })}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Remove text matching"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <TextCriteriaEditor
                label="Conditions"
                criteria={criteria.textMatch ?? { conditions: [], mode: "any", none: [] }}
                readOnly={readOnly}
                onChange={(next) => {
                  const hasContent =
                    (next.conditions && next.conditions.length > 0) ||
                    (next.none && next.none.length > 0);
                  onChange({ ...criteria, textMatch: hasContent ? next : undefined });
                }}
              />
            </div>
          )}

          {/* SNOMED criteria component */}
          {hasSnomed && (
            <div className="rounded-md border border-border bg-background p-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  SNOMED criteria
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...criteria, snomed: undefined })}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Remove SNOMED criteria"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <SnomedCriteriaEditor
                label="Conditions"
                criteria={criteria.snomed ?? { conditions: [], mode: "all" }}
                readOnly={readOnly}
                onChange={(next) => {
                  onChange({ ...criteria, snomed: next.conditions.length > 0 ? next : undefined });
                }}
              />
            </div>
          )}

          {/* ICD-10 criteria component */}
          {hasIcd10 && (
            <div className="rounded-md border border-border bg-background p-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  ICD-10 criteria
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...criteria, icd10: undefined })}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Remove ICD-10 criteria"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Icd10CriteriaEditor
                label="Conditions"
                criteria={criteria.icd10 ?? { conditions: [], mode: "all" }}
                readOnly={readOnly}
                onChange={(next) => {
                  onChange({ ...criteria, icd10: next.conditions.length > 0 ? next : undefined });
                }}
              />
            </div>
          )}

          {/* Custom prompt component */}
          {hasPrompt && (
            <div className="rounded-md border border-border bg-background p-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Custom prompt
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...criteria, prompt: undefined })}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Remove custom prompt"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <PromptCriteriaEditor
                label="Evaluation prompt"
                criteria={criteria.prompt ?? { prompt: "" }}
                readOnly={readOnly}
                onChange={(next) => {
                  onChange({
                    ...criteria,
                    prompt: next.prompt.trim() ? next : undefined,
                  });
                }}
              />
            </div>
          )}

          {/* Add component dropdown */}
          {!readOnly && availableToAdd.length > 0 && (
            <div className="flex items-center gap-2">
              <details className="group">
                <summary className="flex w-fit cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Plus className="h-3 w-3" /> Add component
                </summary>
                <div className="mt-1 flex flex-col gap-0.5">
                  {availableToAdd.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={(e) => {
                        (e.target as HTMLElement).closest("details")?.removeAttribute("open");
                        if (opt.key === "text") {
                          onChange({ ...criteria, textMatch: { conditions: [], mode: "any" } });
                        } else if (opt.key === "snomed") {
                          onChange({ ...criteria, snomed: { conditions: [], mode: "all" } });
                        } else if (opt.key === "icd10") {
                          onChange({ ...criteria, icd10: { conditions: [], mode: "all" } });
                        } else if (opt.key === "prompt") {
                          onChange({ ...criteria, prompt: { prompt: "" } });
                        }
                      }}
                      className="rounded-md border border-border bg-background px-2 py-1 text-left text-xs text-foreground hover:bg-accent"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* Cross-criteria mode selector */}
          {(hasText || hasSnomed || hasIcd10 || hasPrompt) && !readOnly && (
            <div className="flex items-center gap-1.5 border-t border-border pt-2">
              <span className="text-xs text-muted-foreground">Combine:</span>
              <select
                value={criteria.mode ?? "all"}
                onChange={(e) => onChange({ ...criteria, mode: e.target.value as "all" | "any" })}
                className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs outline-none focus:border-corti-lime"
              >
                <option value="all">all (AND)</option>
                <option value="any">any (OR)</option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

type Mode =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "edit"; id: string }
  | { kind: "view"; id: string };

export function NudgeRuleEditor({
  items,
  onUpsert,
  onRemoveMany,
  newId,
}: {
  items: NudgeRule[];
  onUpsert: (item: NudgeRule) => void;
  onRemoveMany: (ids: string[]) => void;
  newId: () => string;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(items[0]?.id);
  const [draft, setDraft] = useState<NudgeRule | null>(null);

  const checkedItems = items.filter((i) => checked.has(i.id));
  const removable = checkedItems.filter((i) => !i.builtin);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const openNew = () => {
    setDraft({
      id: newId(),
      title: "",
      message: "",
      trigger: {},
      resolve: {},
      enabled: true,
      builtin: false,
    });
    setMode({ kind: "new" });
  };

  const openEdit = (item: NudgeRule) => {
    setDraft({
      ...(JSON.parse(JSON.stringify(item)) as NudgeRule),
      trigger: cloneCriteria(item.trigger),
      resolve: cloneCriteria(item.resolve),
    });
    setMode({ kind: "edit", id: item.id });
  };

  const openView = (item: NudgeRule) => {
    setDraft({
      ...(JSON.parse(JSON.stringify(item)) as NudgeRule),
      trigger: cloneCriteria(item.trigger),
      resolve: cloneCriteria(item.resolve),
    });
    setMode({ kind: "view", id: item.id });
  };

  const draftHasPromptTrigger = !!draft?.trigger.prompt;
  const draftValid =
    (draft?.title.trim() ?? "") !== "" &&
    (draftHasPromptTrigger || (draft?.message.trim() ?? "") !== "");

  const save = () => {
    if (!draft) {
      return;
    }
    onUpsert(draft);
    setMode({ kind: "list" });
    setDraft(null);
  };

  const cancel = () => {
    setMode({ kind: "list" });
    setDraft(null);
  };

  const confirmRemove = () => {
    onRemoveMany(removable.map((i) => i.id));
    setChecked(new Set());
    setConfirmOpen(false);
  };

  if (mode.kind === "view" && draft) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">{draft.title}</h4>
          <span className="text-[10px] uppercase text-muted-foreground">built-in (read-only)</span>
        </div>

        <p className="text-xs text-muted-foreground">{draft.message}</p>

        <CriteriaSection
          title="Trigger (when to fire)"
          criteria={draft.trigger}
          readOnly
          onChange={() => {}}
        />

        <CriteriaSection
          title="Resolve (when to auto-resolve)"
          criteria={draft.resolve}
          readOnly
          onChange={() => {}}
        />

        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={cancel}>
            Back to list
          </Button>
        </div>
      </div>
    );
  }

  if ((mode.kind === "new" || mode.kind === "edit") && draft) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">
            {mode.kind === "edit" ? "Edit rule" : "New rule"}
          </h4>
        </div>

        {/* Title */}
        <label htmlFor="nudge-title" className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Title (short, imperative)
          </span>
          <input
            id="nudge-title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="e.g. Specify CHF type"
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime"
          />
        </label>

        {/* Rule ID (editable for custom rules) */}
        {mode.kind === "new" && (
          <label htmlFor="nudge-id" className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Rule ID
            </span>
            <input
              id="nudge-id"
              value={draft.id}
              onChange={(e) => setDraft({ ...draft, id: e.target.value.replace(/\s+/g, "-") })}
              placeholder="e.g. my-custom-rule"
              className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-sm outline-none focus:border-corti-lime"
            />
          </label>
        )}

        {/* Message */}
        <label htmlFor="nudge-message" className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Display message{draftHasPromptTrigger ? " (optional — agent can generate)" : ""}
          </span>
          <textarea
            id="nudge-message"
            value={draft.message}
            onChange={(e) => setDraft({ ...draft, message: e.target.value })}
            placeholder={
              draftHasPromptTrigger
                ? "Leave empty to let the agent generate a message, or provide a fixed message"
                : "e.g. CHF documented without type (systolic/diastolic)"
            }
            rows={2}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime"
          />
        </label>

        {/* Trigger */}
        <CriteriaSection
          title="Trigger (when to fire)"
          criteria={draft.trigger}
          onChange={(next) => setDraft({ ...draft, trigger: next })}
        />

        {/* Resolve */}
        <CriteriaSection
          title="Resolve (when to auto-resolve)"
          criteria={draft.resolve}
          onChange={(next) => setDraft({ ...draft, resolve: next })}
        />

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={!draftValid}>
            {mode.kind === "edit" ? "Save" : "Add rule"}
          </Button>
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Grammar syntax: <code>[word]</code> optional, <code>(a|b|c)</code> alternation,{" "}
          <code>(textMatch.conditions)</code> self-reference, space-separated groups are AND-ed.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={openNew}>
          <Plus className="h-4 w-4" /> New rule
        </Button>
        {selected && !selected.builtin && (
          <Button size="sm" variant="outline" onClick={() => openEdit(selected)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )}
        {selected?.builtin && (
          <Button size="sm" variant="outline" onClick={() => openView(selected)}>
            <Eye className="h-4 w-4" /> View
          </Button>
        )}
        <a
          href="https://snomedbrowser.org/?perspective=full&conceptId1=404684003&edition=MAIN/2026-09-01&release=&languages=en"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button size="sm" variant="outline" type="button">
            <ExternalLink className="h-4 w-4" /> SNOMED browser
          </Button>
        </a>
        <a href="https://www.icd10data.com/ICD10CM/Codes" target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline" type="button">
            <ExternalLink className="h-4 w-4" /> ICD-10 index
          </Button>
        </a>
        {checked.size > 0 && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadJson("nudge-rules.json", toExport(checkedItems))}
            >
              <Download className="h-4 w-4" /> Export ({checked.size})
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={removable.length === 0}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Remove ({removable.length})
            </Button>
          </>
        )}
      </div>

      <ul className="flex max-h-72 flex-col gap-1 overflow-auto">
        {items.length === 0 && (
          <li className="px-1 py-2 text-sm text-muted-foreground">No rules yet.</li>
        )}
        {items.length > 0 && (
          <li className="flex items-center gap-2 pb-1">
            <button
              type="button"
              onClick={() =>
                setChecked(
                  checked.size === items.length ? new Set() : new Set(items.map((i) => i.id)),
                )
              }
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {checked.size === items.length ? "Deselect all" : "Select all"}
            </button>
          </li>
        )}
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={checked.has(item.id)}
              onChange={() => toggle(item.id)}
              aria-label={`Select ${item.title}`}
              className="shrink-0 accent-corti-lime"
            />
            <button
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={`flex-1 truncate rounded-md px-2 py-1 text-left text-sm transition-colors ${
                item.id === selected?.id
                  ? "bg-accent text-foreground ring-1 ring-inset ring-corti-lime/60"
                  : "text-foreground hover:bg-accent/50"
              }`}
            >
              {item.title}
              {!item.builtin && (
                <span className="ml-1 rounded bg-corti-lime/20 px-1 text-[10px] uppercase">
                  custom
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove rules?</DialogTitle>
            <DialogDescription>
              This removes {removable.length} custom rule{removable.length === 1 ? "" : "s"}
              {checkedItems.length > removable.length ? " (built-in entries stay)." : "."} This
              can't be undone — export first if you want a copy.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

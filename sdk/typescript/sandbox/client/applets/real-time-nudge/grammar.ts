/**
 * Grammar evaluator for nudge rule `contains` expressions.
 *
 * A `contains` value can be a plain string (simple substring match) or a grammar expression with the following syntax:
 *
 * - `[optional]` — the bracketed text is optional in a phrase. E.g.
 *   `[congestive] heart failure` matches both "congestive heart failure"
 *   and "heart failure".
 * - `(A|B|C)` — alternation: one of the pipe-separated options must be
 *   present as a substring. E.g. `(systolic|diastolic)` fires when either
 *   "systolic" or "diastolic" appears in the text.
 * - `{textMatch.conditions}` — self-reference: expands to the `conditions`
 *   values of the rule's own trigger.textMatch, evaluated as grammar
 *   expressions. Lets the resolve criteria reference the trigger terms without
 *   repeating them.
 * - Multiple space-separated groups are AND-ed: all must match.
 *
 * The grammar is intentionally lightweight — not a full regex engine.
 * It covers the common CDI query patterns: "documented condition X
 * without specificity Y or Z."
 */

import type { NudgeRule, TextCondition } from "./nudgeRules";

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

type TokenType = "alternation" | "literal" | "reference";

interface Token {
  type: TokenType;
  // alternation: the options (each is a plain string, not a nested expr)
  options?: string[];
  // literal: the required text, with optional prefix stripped out
  text?: string;
  // reference: the dotted path, e.g. "textMatch.conditions"
  reference?: string;
}

/**
 * Tokenize a contains expression into top-level groups separated by
 * whitespace, respecting () and [] nesting so options that contain
 * spaces (e.g. "combined systolic diastolic") stay together.
 */
function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = expr.length;

  while (i < len) {
    // Skip whitespace between groups.
    while (i < len && expr[i] === " ") {
      i++;
    }
    if (i >= len) {
      break;
    }

    // Alternation group: (A|B|C) or a reference like (textMatch.conditions)
    if (expr[i] === "(") {
      i++; // skip (
      let depth = 1;
      const start = i;
      while (i < len && depth > 0) {
        if (expr[i] === "(") {
          depth++;
        }
        if (expr[i] === ")") {
          depth--;
        }
        if (depth > 0) {
          i++;
        }
      }
      const inner = expr.slice(start, i).trim();
      i++; // skip closing )

      // If the group has no pipe and looks like a dotted reference path
      // (e.g. "textMatch.conditions"), treat it as a reference, not a
      // single-option alternation. Also accepts (textMatch.any) for legacy rules.
      if (!inner.includes("|") && /^\w+\.\w+/.test(inner)) {
        tokens.push({ type: "reference", reference: inner });
      } else {
        const options = inner
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean);
        tokens.push({ type: "alternation", options });
      }
      continue;
    }

    // Reference: {path}
    if (expr[i] === "{") {
      i++; // skip {
      const start = i;
      while (i < len && expr[i] !== "}") {
        i++;
      }
      const ref = expr.slice(start, i).trim();
      i++; // skip }
      tokens.push({ type: "reference", reference: ref });
      continue;
    }

    // Literal text, possibly with [optional] prefix.
    // Read until the next whitespace at depth 0, or the start of a
    // () or {} group.
    let start = i;
    let optionalPrefix: string | null = null;
    let depth = 0;

    // Check for leading [optional]
    if (expr[i] === "[") {
      i++; // skip [
      const optStart = i;
      while (i < len && expr[i] !== "]") {
        i++;
      }
      optionalPrefix = expr.slice(optStart, i).trim();
      i++; // skip ]
      // Skip space after ] if present: "[congestive] heart failure"
      while (i < len && expr[i] === " ") {
        i++;
      }
      start = i;
    }

    // Read the rest of this group until whitespace or next group marker.
    while (i < len) {
      if (depth === 0 && expr[i] === " ") {
        break;
      }
      if (expr[i] === "(" || expr[i] === "{") {
        depth++;
      } else if (expr[i] === ")" || expr[i] === "}") {
        depth--;
      }
      if (depth < 0) {
        break;
      }
      i++;
    }

    const text = expr.slice(start, i).trim();
    if (text) {
      tokens.push({
        type: "literal",
        text,
        // optionalPrefix is informational for substring matching (the
        // required text matches both with and without the prefix).
        ...(optionalPrefix ? { optionalPrefix } : {}),
      } as Token);
    } else if (optionalPrefix) {
      // Edge case: "[X]" with nothing after — treat the optional text
      // as the literal.
      tokens.push({ type: "literal", text: optionalPrefix });
    }
  }

  return tokens;
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

export interface GrammarContext {
  /** The rule's trigger textMatch conditions (for {textMatch.conditions} refs). */
  triggerConditions: TextCondition[];
}

function evalToken(text: string, token: Token, context?: GrammarContext): boolean {
  const lower = text.toLowerCase();

  switch (token.type) {
    case "literal":
      return lower.includes(token.text?.toLowerCase());

    case "alternation":
      return token.options?.some((opt) => lower.includes(opt.toLowerCase()));

    case "reference": {
      if (!context || !token.reference) {
        return false;
      }
      // Accept textMatch.conditions and textMatch.any (legacy field name).
      if (token.reference === "textMatch.conditions" || token.reference === "textMatch.any") {
        const values = context.triggerConditions;
        if (!values) {
          return false;
        }
        return values.some((v) => evalContains(text, v.contains, context));
      }
      return false;
    }
  }
}

/**
 * Evaluate a `contains` expression against `text`.
 * Returns true if all groups in the expression match (AND logic).
 */
export function evalContains(text: string, expr: string, context?: GrammarContext): boolean {
  const tokens = tokenize(expr);
  if (tokens.length === 0) {
    // Plain string — fall back to simple substring match.
    return text.toLowerCase().includes(expr.toLowerCase());
  }
  return tokens.every((t) => evalToken(text, t, context));
}

/**
 * Build the grammar context for a rule, so {textMatch.conditions} references
 * resolve to the rule's own trigger conditions. Also accepts {textMatch.any}
 * for rules saved with the old field name.
 */
export function buildContext(rule: NudgeRule): GrammarContext | undefined {
  // Fall back to `any` for rules saved with the old field name.
  const tm = rule.trigger.textMatch as
    | { conditions?: TextCondition[]; any?: TextCondition[] }
    | undefined;
  const conditions = tm?.conditions ?? tm?.any;
  if (!conditions || conditions.length === 0) {
    return undefined;
  }
  return { triggerConditions: conditions };
}

/**
 * Genie model — types, validation, and message building for the Command Genie applet.
 *
 * The genie agent returns JSON describing either a `ManagedCommand` (command mode)
 * or a `NudgeRule` (nudge mode). This module validates the agent's response and
 * converts it into the internal types used by the command store and nudge rule
 * store respectively.
 */
import type { CommandAction, KeyCombo } from "../_shared/commandDispatch";
import type { ManagedCommand, ManagedVariable } from "../dictation-commands/commandModel";
import type {
  CodeCondition,
  CodeConditionEntry,
  CodeOp,
  NudgeRule,
  RuleCriteria,
  TextCondition,
  TextMatchCriteria,
} from "../real-time-nudge/nudgeRules";

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

export type GenieMode = "command" | "nudge";

export interface GenieRequest {
  mode: GenieMode;
  /** Command mode: comma-separated trigger phrases. Nudge mode: trigger description. */
  input1: string;
  /** Command mode: action description. Nudge mode: nudge message/goal. */
  input2: string;
}

/* ------------------------------------------------------------------ */
/* Raw agent response shapes (before validation)                       */
/* ------------------------------------------------------------------ */

interface RawCommandResponse {
  type: string;
  command?: RawCommand;
}

interface RawCommand {
  id?: unknown;
  phrases?: unknown;
  variables?: unknown;
  action?: unknown;
  description?: unknown;
}

interface RawNudgeResponse {
  type: string;
  rule?: RawNudgeRule;
}

interface RawNudgeRule {
  id?: unknown;
  title?: unknown;
  message?: unknown;
  trigger?: unknown;
  resolve?: unknown;
  enabled?: unknown;
}

/* ------------------------------------------------------------------ */
/* Validation result                                                   */
/* ------------------------------------------------------------------ */

export type GenieResult =
  | { ok: true; mode: "command"; command: ManagedCommand }
  | { ok: true; mode: "nudge"; rule: NudgeRule }
  | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const ID_RE = /^[a-zA-Z0-9_-]+$/;
const VALID_ACTION_KINDS = new Set([
  "insert_text",
  "keypress",
  "script",
  "delete_last",
  "new_paragraph",
  "capitalize_last",
  "insert_template",
  "select_enum",
  "select_wildcard",
  "format",
  "noop",
]);

const VALID_OPS = new Set(["=", "is-a", "descendent-of"]);
const VALID_CONDITIONS = new Set(["present", "absent"]);

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNonEmptyString(v: unknown): v is string {
  return isString(v) && v.trim().length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => isString(item));
}

function isNonEmptyStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((item) => isNonEmptyString(item));
}

/* ------------------------------------------------------------------ */
/* Command validation                                                  */
/* ------------------------------------------------------------------ */

function validateKeyCombo(raw: unknown): KeyCombo | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.key)) {
    return null;
  }
  return {
    key: obj.key,
    ctrl: Boolean(obj.ctrl),
    meta: Boolean(obj.meta),
    alt: Boolean(obj.alt),
    shift: Boolean(obj.shift),
  };
}

function validateAction(raw: unknown): CommandAction | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind;
  if (!isNonEmptyString(kind) || !VALID_ACTION_KINDS.has(kind)) {
    return null;
  }

  switch (kind) {
    case "insert_text":
      return isNonEmptyString(obj.text) ? { kind: "insert_text", text: obj.text } : null;
    case "keypress": {
      if (!Array.isArray(obj.combos) || obj.combos.length === 0) {
        return null;
      }
      const combos: KeyCombo[] = [];
      for (const c of obj.combos) {
        const combo = validateKeyCombo(c);
        if (!combo) {
          return null;
        }
        combos.push(combo);
      }
      return { kind: "keypress", combos };
    }
    case "script":
      return isNonEmptyString(obj.code) ? { kind: "script", code: obj.code } : null;
    case "delete_last":
      return { kind: "delete_last" };
    case "new_paragraph":
      return { kind: "new_paragraph" };
    case "capitalize_last":
      return { kind: "capitalize_last" };
    case "insert_template":
      return isNonEmptyString(obj.variableKey)
        ? { kind: "insert_template", variableKey: obj.variableKey }
        : null;
    case "select_enum":
      return isNonEmptyString(obj.variableKey)
        ? { kind: "select_enum", variableKey: obj.variableKey }
        : null;
    case "select_wildcard":
      return isNonEmptyString(obj.variableKey)
        ? { kind: "select_wildcard", variableKey: obj.variableKey }
        : null;
    case "format":
      return isNonEmptyString(obj.variableKey)
        ? { kind: "format", variableKey: obj.variableKey }
        : null;
    case "noop":
      return { kind: "noop", note: isString(obj.note) ? obj.note : undefined };
    default:
      return null;
  }
}

function validateVariable(raw: unknown): ManagedVariable | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.key)) {
    return null;
  }
  if (obj.type === "wildcard") {
    return { key: obj.key.trim(), type: "wildcard" };
  }
  if (obj.type === "enum") {
    if (!isStringArray(obj.enum) || obj.enum.length === 0) {
      return null;
    }
    return {
      key: obj.key.trim(),
      type: "enum",
      enum: obj.enum.map((s) => s.trim()).filter(Boolean),
    };
  }
  return null;
}

function validateCommand(raw: RawCommand): ManagedCommand | null {
  if (!isNonEmptyString(raw.id) || !ID_RE.test(raw.id)) {
    return null;
  }
  if (!isNonEmptyStringArray(raw.phrases)) {
    return null;
  }
  const action = validateAction(raw.action);
  if (!action) {
    return null;
  }

  const command: ManagedCommand = {
    id: raw.id.trim(),
    phrases: raw.phrases.map((p) => p.trim()).filter(Boolean),
    action,
    builtin: false,
  };

  if (Array.isArray(raw.variables) && raw.variables.length > 0) {
    const variables: ManagedVariable[] = [];
    for (const v of raw.variables) {
      const variable = validateVariable(v);
      if (!variable) {
        return null;
      }
      variables.push(variable);
    }
    if (variables.length > 0) {
      command.variables = variables;
    }
  }

  if (isNonEmptyString(raw.description)) {
    command.description = raw.description;
  }

  return command;
}

/* ------------------------------------------------------------------ */
/* Nudge validation                                                    */
/* ------------------------------------------------------------------ */

function validateTextCondition(raw: unknown): TextCondition | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.contains)) {
    return null;
  }
  const condition: TextCondition = { contains: obj.contains };
  if (isString(obj.pattern)) {
    condition.pattern = obj.pattern;
  }
  return condition;
}

function validateTextMatch(raw: unknown): TextMatchCriteria | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const result: TextMatchCriteria = {};

  if (Array.isArray(obj.conditions)) {
    const conditions: TextCondition[] = [];
    for (const c of obj.conditions) {
      const cond = validateTextCondition(c);
      if (!cond) {
        return null;
      }
      conditions.push(cond);
    }
    if (conditions.length > 0) {
      result.conditions = conditions;
    }
  }

  if (obj.mode === "all" || obj.mode === "any") {
    result.mode = obj.mode;
  }

  if (Array.isArray(obj.none)) {
    const none: TextCondition[] = [];
    for (const c of obj.none) {
      const cond = validateTextCondition(c);
      if (!cond) {
        return null;
      }
      none.push(cond);
    }
    if (none.length > 0) {
      result.none = none;
    }
  }

  if (Array.isArray(obj.groups)) {
    const groups: { name: string; criteria: TextMatchCriteria }[] = [];
    for (const g of obj.groups) {
      if (typeof g !== "object" || g === null) {
        return null;
      }
      const gObj = g as Record<string, unknown>;
      if (!isNonEmptyString(gObj.name)) {
        return null;
      }
      const criteria = validateTextMatch(gObj.criteria);
      if (!criteria) {
        return null;
      }
      groups.push({ name: gObj.name, criteria });
    }
    if (groups.length > 0) {
      result.groups = groups;
    }
  }

  if (typeof obj.minGroups === "number") {
    result.minGroups = obj.minGroups;
  }

  return Object.keys(result).length > 0 ? result : null;
}

function validateCodeCondition(raw: unknown): CodeConditionEntry | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.code)) {
    return null;
  }
  if (!isString(obj.op) || !VALID_OPS.has(obj.op)) {
    return null;
  }
  if (!isString(obj.condition) || !VALID_CONDITIONS.has(obj.condition)) {
    return null;
  }
  return {
    code: obj.code,
    op: obj.op as CodeOp,
    condition: obj.condition as CodeCondition,
  };
}

function validateCodeCriteria(
  raw: unknown,
): { conditions: CodeConditionEntry[]; mode: "all" | "any" } | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.conditions) || obj.conditions.length === 0) {
    return null;
  }
  const conditions: CodeConditionEntry[] = [];
  for (const c of obj.conditions) {
    const cond = validateCodeCondition(c);
    if (!cond) {
      return null;
    }
    conditions.push(cond);
  }
  const mode = obj.mode === "any" ? "any" : "all";
  return { conditions, mode };
}

function validatePromptCriteria(raw: unknown): { prompt: string } | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.prompt)) {
    return null;
  }
  if (obj.prompt.length > 500) {
    return null;
  }
  return { prompt: obj.prompt };
}

function validateRuleCriteria(raw: unknown): RuleCriteria | null {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const obj = raw as Record<string, unknown>;
  const result: RuleCriteria = {};

  if (obj.textMatch !== undefined && obj.textMatch !== null) {
    const tm = validateTextMatch(obj.textMatch);
    if (!tm) {
      return null;
    }
    result.textMatch = tm;
  }

  if (obj.snomed !== undefined && obj.snomed !== null) {
    const sc = validateCodeCriteria(obj.snomed);
    if (!sc) {
      return null;
    }
    result.snomed = sc;
  }

  if (obj.icd10 !== undefined && obj.icd10 !== null) {
    const ic = validateCodeCriteria(obj.icd10);
    if (!ic) {
      return null;
    }
    result.icd10 = ic;
  }

  if (obj.prompt !== undefined && obj.prompt !== null) {
    const pc = validatePromptCriteria(obj.prompt);
    if (!pc) {
      return null;
    }
    result.prompt = pc;
  }

  if (obj.mode === "all" || obj.mode === "any") {
    result.mode = obj.mode;
  }

  return result;
}

function validateNudge(raw: RawNudgeRule): NudgeRule | null {
  if (!isNonEmptyString(raw.id) || !ID_RE.test(raw.id)) {
    return null;
  }
  if (!isNonEmptyString(raw.title)) {
    return null;
  }
  if (!isString(raw.message)) {
    return null;
  }

  const trigger = validateRuleCriteria(raw.trigger);
  if (!trigger) {
    return null;
  }
  const resolve = validateRuleCriteria(raw.resolve);
  if (!resolve) {
    return null;
  }

  return {
    id: raw.id.trim(),
    title: raw.title,
    message: raw.message,
    trigger,
    resolve,
    enabled: raw.enabled !== false,
  };
}

/* ------------------------------------------------------------------ */
/* JSON extraction                                                     */
/* ------------------------------------------------------------------ */

/**
 * Extract a JSON object from the agent's text response. The agent may wrap the
 * JSON in markdown code fences or add stray prose — strip those before parsing.
 */
function extractJson(text: string): unknown | null {
  if (!text || !text.trim()) {
    return null;
  }

  let str = text.trim();

  // Strip markdown code fences if present.
  const fenceMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    str = fenceMatch[1].trim();
  }

  // Find the outermost JSON object boundaries.
  const start = str.indexOf("{");
  if (start === -1) {
    return null;
  }
  let depth = 0;
  let end = -1;
  for (let i = start; i < str.length; i++) {
    if (str[i] === "{") {
      depth++;
    } else if (str[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    return null;
  }

  try {
    return JSON.parse(str.slice(start, end + 1));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Build the JSON message to send to the genie agent.
 */
export function buildGenieMessage(mode: GenieMode, input1: string, input2: string): string {
  return JSON.stringify({ mode, input1, input2 });
}

/**
 * Parse and validate the agent's response.
 *
 * Returns `{ ok: true, command }` for valid command responses,
 * `{ ok: true, rule }` for valid nudge responses,
 * or `{ ok: false, error }` for invalid responses.
 */
export function parseGenieResponse(text: string, mode: GenieMode): GenieResult {
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Agent response was not valid JSON." };
  }

  if (mode === "command") {
    const raw = parsed as RawCommandResponse;
    if (raw.type !== "command" || !raw.command) {
      return {
        ok: false,
        error: 'Response type must be "command" with a command field.',
      };
    }
    const command = validateCommand(raw.command);
    if (!command) {
      return {
        ok: false,
        error: "Command validation failed — check id, phrases, and action structure.",
      };
    }
    return { ok: true, mode: "command", command };
  }

  const raw = parsed as RawNudgeResponse;
  if (raw.type !== "nudge" || !raw.rule) {
    return {
      ok: false,
      error: 'Response type must be "nudge" with a rule field.',
    };
  }
  const rule = validateNudge(raw.rule);
  if (!rule) {
    return {
      ok: false,
      error: "Nudge rule validation failed — check id, title, message, trigger, and resolve.",
    };
  }
  return { ok: true, mode: "nudge", rule };
}

/**
 * Generate a summary string for the success message.
 */
export function summarizeCommand(command: ManagedCommand): string {
  const actionDesc: Record<string, string> = {
    insert_text: `insert "${command.action.kind === "insert_text" ? command.action.text : ""}"`,
    keypress: "execute a keypress sequence",
    script: "run a custom script",
    delete_last: "delete the last dictated segment",
    new_paragraph: "insert a new paragraph",
    capitalize_last: "capitalize the last dictated segment",
    insert_template: "insert a template",
    select_enum: "select a range",
    select_wildcard: "select text",
    format: "format the selection",
    noop: "do nothing (no-op)",
  };
  const action = actionDesc[command.action.kind] ?? command.action.kind;
  return `Command "${command.id}" that ${action} is ready for use.`;
}

export function summarizeNudge(rule: NudgeRule): string {
  return `Nudge rule "${rule.title}" that reminds "${rule.message || rule.title}" is ready for use.`;
}

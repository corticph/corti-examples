import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useProfiles } from "../context/ProfilesContext";
import { endpointById } from "../endpoints/registry";
import type { FormValues, ParamPicker as ParamPickerSpec } from "../endpoints/types";
import { emptyValuesFor } from "../endpoints/types";
import { executeRequest } from "../lib/requestExecutor";
import { Input, Select } from "./ui/Input";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; items: any[] }
  | { kind: "error"; message: string };

function getPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Try each candidate path; return the first non-empty value found. */
function getValue(item: unknown, paths: string | string[]): string {
  // If the list returned an array of primitives (e.g. a bare UUID string),
  // use the item itself as the value.
  if (typeof item === "string" || typeof item === "number") {
    return String(item);
  }
  const candidates = Array.isArray(paths) ? paths : [paths];
  for (const p of candidates) {
    const v = getPath(item, p);
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
}

function extractItems(response: unknown): any[] {
  if (Array.isArray(response)) return response;
  if (response && typeof response === "object") {
    const obj = response as any;
    for (const key of [
      "data",
      "interactions",
      "recordings",
      "transcripts",
      "documents",
      "templates",
      "items",
    ]) {
      if (Array.isArray(obj[key])) return obj[key];
    }
  }
  return [];
}

function shortId(v: string): string {
  return v.length > 12 ? `${v.slice(0, 8)}…${v.slice(-4)}` : v;
}

/** Walk a template object/array/string. Replace any "$value" leaf with the provided value. */
function substituteTemplate(template: unknown, value: unknown): unknown {
  if (template === "$value") return value;
  if (Array.isArray(template)) return template.map((t) => substituteTemplate(t, value));
  if (template && typeof template === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template as Record<string, unknown>)) {
      out[k] = substituteTemplate(v, value);
    }
    return out;
  }
  return template;
}

export function ParamPicker({
  picker,
  value,
  onChange,
  parentValues,
  localObject,
  onReplaceParentArray,
}: {
  picker: ParamPickerSpec;
  value: string;
  /** Receives a string for plain pickers and any JSON-shaped value when `fetchOnSelect` is set. */
  onChange: (v: any) => void;
  /** Sibling form values, needed when picker.parentParams is set. */
  parentValues?: FormValues;
  /** Immediate sibling body fields — read when parentParam.from.in === "body". */
  localObject?: Record<string, unknown>;
  /** When this picker lives inside an array item, replace the WHOLE parent array. Used by spreadIntoParentArray. */
  onReplaceParentArray?: (items: unknown[]) => void;
}) {
  const { active, ensureToken } = useProfiles();
  const [state, setState] = useState<State>({ kind: "idle" });
  // Start in manual mode if the incoming value is obviously not a picker option —
  // notably template references like `{{interactions_create_1.interactionId}}` from
  // upstream workflow nodes. Otherwise the dropdown silently shows "— pick an option —"
  // and the real value looks lost. A post-load effect below handles the other case
  // (saved value that's just not in the loaded list).
  const [manual, setManual] = useState(() => isTemplate(value));
  const autoSwitchedRef = useRef(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // After options load: if the current value doesn't match any item, switch to manual
  // automatically. Only runs once (via autoSwitchedRef) so the user can deliberately
  // toggle back to picker without us flipping them straight back to manual.
  useEffect(() => {
    if (manual || autoSwitchedRef.current) return;
    if (!value) return;
    if (state.kind !== "ready") return;
    const matches = state.items.some((item) => getValue(item, picker.valueField) === value);
    if (!matches) {
      autoSwitchedRef.current = true;
      setManual(true);
    }
  }, [state, value, manual, picker.valueField]);

  // Resolve parent dependencies once per render.
  const parentEntries = useMemo(() => {
    return (picker.parentParams ?? []).map((p) => {
      const fromVal =
        p.from.in === "body"
          ? ((localObject?.[p.from.name] as string) ?? "")
          : (parentValues?.[p.from.in]?.[p.from.name] ?? "");
      return { ...p, fromVal };
    });
  }, [picker.parentParams, parentValues, localObject]);

  const missingParents = parentEntries.filter((p) => !p.fromVal);
  const parentFingerprint = parentEntries
    .map((p) => `${p.from.in}.${p.from.name}=${p.fromVal}`)
    .join("|");

  const load = useCallback(async () => {
    if (!active) {
      setState({ kind: "error", message: "No active profile." });
      return;
    }
    if (missingParents.length > 0) {
      // Wait for parent values; not an error.
      setState({ kind: "idle" });
      return;
    }
    const endpoint = endpointById[picker.fromEndpoint];
    if (!endpoint) {
      setState({ kind: "error", message: `Unknown endpoint ${picker.fromEndpoint}` });
      return;
    }
    setState({ kind: "loading" });
    try {
      const token = await ensureToken(active.id);
      const values = emptyValuesFor(endpoint);
      // Inject parent values into the source endpoint's path/query.
      for (const p of parentEntries) {
        values[p.to.in][p.to.name] = p.fromVal;
      }
      const res = await executeRequest({
        endpoint,
        values,
        profile: active,
        token,
      });
      if (res.status >= 400) {
        setState({ kind: "error", message: `${res.status} ${res.statusText}` });
        return;
      }
      setState({ kind: "ready", items: extractItems(res.body) });
    } catch (e: any) {
      setState({ kind: "error", message: e?.message ?? String(e) });
    }
    // parentEntries is derived from parentFingerprint — fingerprint string is the stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ensureToken, picker.fromEndpoint, parentFingerprint]);

  useEffect(() => {
    load();
  }, [load]);

  if (manual) {
    const displayValue =
      typeof value === "string" || value == null
        ? ((value as string) ?? "")
        : JSON.stringify(value, null, 2);
    return (
      <div className="flex items-center gap-2">
        <Input
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder="paste an ID"
          className="font-mono"
        />
        <button
          onClick={() => setManual(false)}
          className="whitespace-nowrap rounded-lg border border-muted-300 px-2 py-1 text-xs text-muted-700 hover:bg-paper-muted"
        >
          Use picker
        </button>
      </div>
    );
  }

  if (missingParents.length > 0) {
    const label = missingParents.map((p) => p.label ?? p.from.name).join(", ");
    return (
      <div className="grid gap-2">
        <div className="rounded border border-muted-300 bg-paper-muted px-2 py-1.5 text-xs text-muted-700">
          Fill in <span className="font-mono">{label}</span> first to load options.
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManual(true)}
            className="rounded-lg border border-muted-300 px-2 py-1 text-xs text-muted-700 hover:bg-paper-muted"
          >
            Enter manually
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === "loading") {
    return <div className="text-xs text-muted-500">Loading options…</div>;
  }

  if (state.kind === "error") {
    return (
      <div className="grid gap-2">
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          Couldn't load picker: {state.message}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="rounded-lg border border-muted-300 px-2 py-1 text-xs text-muted-700 hover:bg-paper-muted"
          >
            Retry
          </button>
          <button
            onClick={() => setManual(true)}
            className="rounded-lg border border-muted-300 px-2 py-1 text-xs text-muted-700 hover:bg-paper-muted"
          >
            Enter manually
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === "ready" && state.items.length === 0) {
    return (
      <div className="grid gap-2">
        <div className="rounded border border-muted-300 bg-paper-muted px-2 py-1.5 text-xs text-muted-700">
          No {pluralize(picker.fromEndpoint)} found.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {picker.createEndpoint && (
            <Link
              to={`/endpoints/${encodeURIComponent(picker.createEndpoint)}`}
              className="rounded-lg bg-ink px-3 py-1 text-xs font-medium text-paper hover:bg-ink-soft"
            >
              {picker.createLabel ?? "Create one"} →
            </Link>
          )}
          <button
            onClick={load}
            className="rounded-lg border border-muted-300 px-2 py-1 text-xs text-muted-700 hover:bg-paper-muted"
          >
            Refresh
          </button>
          <button
            onClick={() => setManual(true)}
            className="rounded-lg border border-muted-300 px-2 py-1 text-xs text-muted-700 hover:bg-paper-muted"
          >
            Enter manually
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === "ready") {
    return (
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <Select
            value={selectShownValue(value, state.items, picker)}
            onChange={(e) => handlePick(e.target.value)}
            disabled={fetching}
          >
            <option value="">— pick an option —</option>
            {state.items.map((item, idx) => {
              const v = getValue(item, picker.valueField);
              if (!v) return null;
              let label: string;
              if (picker.displayLabel) {
                label = picker.displayLabel(item) || v;
              } else {
                const parts = (picker.labelFields ?? [])
                  .map((f) => getPath(item, f))
                  .filter((x) => x !== undefined && x !== null && x !== "");
                label = parts.length ? `${shortId(v)} · ${parts.join(" · ")}` : v;
              }
              const title = picker.displayTitle ? picker.displayTitle(item) : undefined;
              return (
                <option key={`${v}-${idx}`} value={v} title={title}>
                  {label}
                </option>
              );
            })}
          </Select>
          <button
            onClick={load}
            title="Refresh"
            disabled={fetching}
            className="whitespace-nowrap rounded-lg border border-muted-300 px-2 py-1 text-xs text-muted-700 hover:bg-paper-muted disabled:opacity-50"
          >
            ↻
          </button>
          <button
            onClick={() => setManual(true)}
            className="whitespace-nowrap rounded-lg border border-muted-300 px-2 py-1 text-xs text-muted-700 hover:bg-paper-muted"
          >
            Manual
          </button>
        </div>
        {fetching && <div className="text-xs text-muted-500">Fetching content…</div>}
        {fetchError && (
          <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
            {fetchError}
          </div>
        )}
      </div>
    );
  }

  return null;

  // ---- helpers ----

  async function handlePick(pickedValue: string) {
    if (!pickedValue) {
      onChange("");
      return;
    }
    // If no follow-up fetch is configured, just use the picked value as-is.
    if (!picker.fetchOnSelect) {
      onChange(pickedValue);
      return;
    }
    if (!active) {
      setFetchError("No active profile.");
      return;
    }
    const endpoint = endpointById[picker.fetchOnSelect.endpoint];
    if (!endpoint) {
      setFetchError(`Unknown endpoint ${picker.fetchOnSelect.endpoint}`);
      return;
    }
    setFetching(true);
    setFetchError(null);
    try {
      const token = await ensureToken(active.id);
      const fetchValues = emptyValuesFor(endpoint);
      // Inject parent params (same ones the list picker uses)
      for (const p of parentEntries) {
        fetchValues[p.to.in][p.to.name] = p.fromVal;
      }
      // Inject the picked value into the configured path param
      fetchValues.path[picker.fetchOnSelect.valueParam] = pickedValue;
      const res = await executeRequest({ endpoint, values: fetchValues, profile: active, token });
      if (res.status >= 400) {
        setFetchError(`${res.status} ${res.statusText}`);
        return;
      }
      let extracted: unknown = res.body;
      if (picker.fetchOnSelect.extract) {
        extracted = getPath(res.body, picker.fetchOnSelect.extract);
      }
      if (picker.fetchOnSelect.transform) {
        extracted = picker.fetchOnSelect.transform(extracted);
      }
      // If configured to spread across the parent array, replace the array with one item per element.
      if (
        picker.fetchOnSelect.spreadIntoParentArray &&
        Array.isArray(extracted) &&
        onReplaceParentArray
      ) {
        const template = picker.fetchOnSelect.itemTemplate ?? "$value";
        const items = extracted.map((el) => substituteTemplate(template, el));
        if (items.length === 0) {
          setFetchError("Picked source had no items to spread.");
          return;
        }
        const ok = window.confirm(
          `Replace the parent array with ${items.length} item${items.length === 1 ? "" : "s"}? ` +
            `(one item per transcript segment — required by Corti's CommonTranscript shape)`,
        );
        if (!ok) return;
        onReplaceParentArray(items);
        return;
      }
      // Pass the raw value (object/array/string/etc.) so kind:"json" fields receive the actual
      // shape. Stringifying here turns objects into quoted JSON which Corti rejects.
      onChange(extracted);
    } catch (e: any) {
      setFetchError(e?.message ?? String(e));
    } finally {
      setFetching(false);
    }
  }
}

/**
 * If fetchOnSelect is set, the field's stored value is the FETCHED content, not the picker option's id.
 * So when the dropdown opens, no option matches `value` and the placeholder shows up. That's fine —
 * we don't try to reflect "what was last picked" once the content has replaced the id.
 */
// Workflow template syntax — `{{nodeRef.field}}`. When the picker's bound value contains
// this, it's an interpolated reference, not an opaque id you could ever find in a
// dropdown. So we start the picker in manual mode for that case.
function isTemplate(value: string | undefined | null): boolean {
  return typeof value === "string" && /\{\{.*?\}\}/.test(value);
}

function selectShownValue(value: string, items: any[], picker: ParamPickerSpec): string {
  if (picker.fetchOnSelect) return ""; // never matches an option; just shows placeholder
  // If the current value matches one of the options, select it.
  for (const item of items) {
    const v = getValue(item, picker.valueField);
    if (v && v === value) return v;
  }
  return "";
}

function pluralize(endpointId: string): string {
  // "interactions.list" → "interactions"; "recordings.list" → "recordings"
  return endpointId.split(".")[0];
}

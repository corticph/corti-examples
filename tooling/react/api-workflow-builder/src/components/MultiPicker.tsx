import { useCallback, useEffect, useMemo, useState } from "react";
import { useProfiles } from "../context/ProfilesContext";
import { endpointById } from "../endpoints/registry";
import type { FormValues, MultiPickerConfig } from "../endpoints/types";
import { emptyValuesFor } from "../endpoints/types";
import { executeRequest } from "../lib/requestExecutor";
import { Select } from "./ui/Input";

// Multi-select picker for array fields. Mirrors the console's expert-library pattern:
// fetch a list of options from another endpoint, render a dropdown to pick one, append
// the chosen item to the array as a "chip" with a remove (x) button.
//
// Stays loose about response shapes — the field config tells us where labels live, how
// to dedupe, and how to transform a picked option into the array item shape Corti
// expects. We use the same auto-detection as ParamPicker for the response array.

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; options: any[] }
  | { kind: "error"; message: string };

export function MultiPicker({
  config,
  value,
  onChange,
  parentValues,
}: {
  config: MultiPickerConfig;
  /** The current array value — items already added. */
  value: unknown[];
  onChange: (next: unknown[]) => void;
  /** Sibling FormValues — needed when config.parentParams is set. */
  parentValues?: FormValues;
}) {
  const { active, ensureToken } = useProfiles();
  const [state, setState] = useState<State>({ kind: "idle" });
  const labelField = config.labelField ?? "name";
  const subLabelField = config.subLabelField ?? "registryKey";

  // Resolve parent dependencies once per render — same shape as ParamPicker.
  const parentEntries = useMemo(() => {
    return (config.parentParams ?? []).map((p) => {
      const fromVal =
        p.from.in === "body"
          ? "" // body-mode parents aren't supported here; multipickers live in body themselves
          : (parentValues?.[p.from.in]?.[p.from.name] ?? "");
      return { ...p, fromVal };
    });
  }, [config.parentParams, parentValues]);
  const missingParents = parentEntries.filter((p) => !p.fromVal);
  const fingerprint = parentEntries
    .map((p) => `${p.from.in}.${p.from.name}=${p.fromVal}`)
    .join("|");

  const load = useCallback(async () => {
    // Pure-static mode: no endpoint, just hand back the hardcoded list. No auth or
    // network needed — perfect for option sets that come from the docs (e.g. the
    // agents expert registry).
    if (!config.fromEndpoint) {
      setState({ kind: "ready", options: config.staticOptions ?? [] });
      return;
    }
    if (!active) {
      setState({ kind: "error", message: "No active profile." });
      return;
    }
    if (missingParents.length > 0) {
      setState({ kind: "idle" });
      return;
    }
    const endpoint = endpointById[config.fromEndpoint];
    if (!endpoint) {
      setState({ kind: "error", message: `Unknown endpoint "${config.fromEndpoint}".` });
      return;
    }
    setState({ kind: "loading" });
    try {
      const token = await ensureToken(active.id);
      const ep = endpoint;
      const values = emptyValuesFor(ep);
      for (const p of parentEntries) values[p.to.in][p.to.name] = p.fromVal;
      const res = await executeRequest({ endpoint: ep, values, profile: active, token });
      if (res.status >= 400) {
        // Soft-fail: if the registry endpoint is unreachable but we have a static
        // fallback list, surface that instead of an error so the user can still pick.
        if (config.staticOptions && config.staticOptions.length > 0) {
          setState({ kind: "ready", options: config.staticOptions });
        } else {
          setState({ kind: "error", message: `${res.status} ${res.statusText}` });
        }
        return;
      }
      // Merge: static options first (stable order), fetched options appended for any
      // keys not already in static. Dedup uses the same itemKey the user configured.
      const fetched = extractItems(res.body);
      const merged = config.staticOptions
        ? mergeOptions(config.staticOptions, fetched, (o) => keyForOption(o))
        : fetched;
      setState({ kind: "ready", options: merged });
    } catch (e: any) {
      if (config.staticOptions && config.staticOptions.length > 0) {
        setState({ kind: "ready", options: config.staticOptions });
      } else {
        setState({ kind: "error", message: e?.message ?? String(e) });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ensureToken, config.fromEndpoint, fingerprint]);

  // Helper for the merge — same logic as the per-item keyFor we use for chips so the
  // dedupe is consistent across static + fetched + selected sets.
  function keyForOption(opt: any): string {
    if (config.itemKey) {
      try {
        return config.itemKey(opt);
      } catch {
        /* fall through */
      }
    }
    return getPath(opt, labelField) ?? "";
  }

  useEffect(() => {
    load();
  }, [load]);

  function keyFor(item: any): string {
    if (config.itemKey) {
      try {
        return config.itemKey(item);
      } catch {
        /* fall through */
      }
    }
    return getPath(item, labelField) ?? "";
  }

  const existingKeys = useMemo(() => new Set(value.map((v) => keyFor(v))), [value]);

  function addOption(idx: number) {
    if (state.kind !== "ready") return;
    const option = state.options[idx];
    if (!option) return;
    const item = config.toItem ? config.toItem(option) : option;
    onChange([...value, item]);
  }

  function removeAt(idx: number) {
    const next = value.slice();
    next.splice(idx, 1);
    onChange(next);
  }

  return (
    <div className="grid gap-2">
      {/* Selected items as chips */}
      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed border-muted-300 bg-paper-muted px-3 py-4 text-center text-xs text-muted-500">
          No items added yet. Use the picker below.
        </div>
      ) : (
        <ul className="grid gap-1.5">
          {value.map((item, idx) => {
            // The stored item is usually a slim wire shape (e.g. just `{type, name}` for
            // an experts reference) — try to re-resolve the matching option from the
            // loaded option list so we can show the friendly display label on the chip.
            // Falls back to whatever's on the item itself when no match exists (manual
            // JSON edits, options not yet loaded, etc.).
            const matchingOption =
              state.kind === "ready"
                ? state.options.find((opt) => keyForOption(opt) === keyFor(item))
                : undefined;
            const source = matchingOption ?? item;
            const label = getPath(source, labelField) ?? getPath(item, labelField) ?? "(unnamed)";
            const sub = getPath(source, subLabelField) ?? getPath(item, subLabelField);
            return (
              <li
                key={`${idx}-${keyFor(item)}`}
                className="flex items-start justify-between gap-2 rounded-lg border border-muted-300/60 bg-paper px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{label}</div>
                  {sub && (
                    <div className="truncate font-mono text-[11px] text-muted-500">{sub}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  className="shrink-0 rounded p-1 text-muted-500 hover:bg-red-50 hover:text-red-700"
                  title="Remove"
                  aria-label="Remove"
                >
                  <TrashIcon />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add picker */}
      {missingParents.length > 0 ? (
        <div className="rounded border border-muted-300 bg-paper-muted px-2 py-1.5 text-xs text-muted-700">
          Fill in{" "}
          <span className="font-mono">
            {missingParents.map((p) => p.label ?? p.from.name).join(", ")}
          </span>{" "}
          first to load options.
        </div>
      ) : state.kind === "loading" ? (
        <div className="text-xs text-muted-500">Loading options…</div>
      ) : state.kind === "error" ? (
        <div className="grid gap-1">
          <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
            {state.message}
          </div>
          <button
            onClick={load}
            className="self-start rounded-lg border border-muted-300 bg-paper px-2 py-1 text-xs hover:bg-paper-muted"
          >
            Retry
          </button>
        </div>
      ) : state.kind === "ready" ? (
        <div className="flex items-center gap-2">
          <Select
            value=""
            onChange={(e) => {
              const idx = Number(e.target.value);
              if (Number.isFinite(idx) && idx >= 0) addOption(idx);
              // Reset the select so the same item could (theoretically) be re-picked.
              e.target.value = "";
            }}
            className="flex-1"
          >
            <option value="">+ Add from registry…</option>
            {state.options.map((opt, idx) => {
              const k = keyFor(opt);
              const label = getPath(opt, labelField) ?? `option ${idx}`;
              const sub = getPath(opt, subLabelField);
              const already = existingKeys.has(k);
              return (
                <option key={`${idx}-${k}`} value={String(idx)} disabled={already}>
                  {already ? "✓ " : ""}
                  {label}
                  {sub ? `  ·  ${sub}` : ""}
                </option>
              );
            })}
          </Select>
          <button
            onClick={load}
            title="Refresh"
            className="rounded-lg border border-muted-300 bg-paper px-2 py-1 text-xs text-muted-700 hover:bg-paper-muted"
          >
            ↻
          </button>
        </div>
      ) : null}
    </div>
  );
}

// Small dotted-path getter, matching ParamPicker's helper for response shapes.
function getPath(obj: unknown, path: string): string | undefined {
  if (obj == null || !path) return undefined;
  let cur: any = obj;
  for (const part of path.split(".")) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  if (cur === undefined || cur === null) return undefined;
  return typeof cur === "string" ? cur : String(cur);
}

// Same auto-detection as ParamPicker's extractItems — handles bare arrays + a handful
// of common envelope keys.
function extractItems(response: unknown): any[] {
  if (Array.isArray(response)) return response;
  if (response && typeof response === "object") {
    const obj = response as any;
    for (const key of ["experts", "data", "items", "results"]) {
      if (Array.isArray(obj[key])) return obj[key];
    }
  }
  return [];
}

/**
 * Merge two option lists, deduping by stable key. Static comes first (keeps docs order),
 * fetched options append for any keys not yet seen.
 */
function mergeOptions(staticOpts: any[], fetched: any[], keyOf: (o: any) => string): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const o of staticOpts) {
    const k = keyOf(o);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(o);
    }
  }
  for (const o of fetched) {
    const k = keyOf(o);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(o);
    }
  }
  return out;
}

function TrashIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6 17.5 20a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

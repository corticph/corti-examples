import { useState } from "react";
import type { BodyField, FormValues } from "../endpoints/types";
import {
  AutoUuidToggle,
  GenerateUniqueButton,
  type RuntimeFieldsControl,
  RuntimeToggle,
} from "./EndpointForm";
import { MultiPicker } from "./MultiPicker";
import { ParamPicker } from "./ParamPicker";
import { Input, Label, Select, Textarea } from "./ui/Input";
import { Pill } from "./ui/Pill";

// Generic, schema-driven form for a JSON request body.
// Source of truth is a JS object that mirrors the JSON we'll send.
// Convention: a field whose value is "", null, undefined, [], or {} is OMITTED from the JSON output.
// That keeps PATCH semantics honest — only fields you actually filled get sent.

export function BodyForm({
  schema,
  value,
  onChange,
  parentValues,
  onReplaceParentArray,
  runtime,
  pathPrefix = "body",
}: {
  schema: BodyField[];
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  /** The full FormValues for the surrounding request — needed for body-field pickers that depend on path/query params. */
  parentValues?: FormValues;
  /** When this form is rendered inside an array item, this replaces the entire parent array. */
  onReplaceParentArray?: (items: unknown[]) => void;
  /**
   * Workflow-only: when set, every primitive field renders an "ask at run time" toggle
   * and a "+ unique id" generator. Propagates into nested OBJECT fields with an updated
   * pathPrefix so paths like `body.encounter.identifier` work. Array items are NOT
   * propagated into — their index would make stable paths ambiguous.
   */
  runtime?: RuntimeFieldsControl;
  /**
   * Dotted-path prefix for fields in this form, used to compute `runtimePath` per
   * field. Defaults to "body" at the top level; nested object renders extend it with
   * the field name (e.g. "body.encounter").
   */
  pathPrefix?: string;
}) {
  function setField(name: string, v: unknown) {
    const next = { ...value };
    if (isEmpty(v)) delete next[name];
    else next[name] = v;
    onChange(next);
  }
  // Filter by showWhen — only render fields whose discriminator sibling is in the allowed set.
  // Then sort required fields to the top so they're always seen first, at every nesting level.
  // Use a stable sort by relying on a numeric sort-key (required=0, optional=1) plus the original
  // index as a tiebreaker.
  const visible = schema
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => showWhenMet(f, value))
    .sort((a, b) => {
      const ra = a.f.required ? 0 : 1;
      const rb = b.f.required ? 0 : 1;
      return ra - rb || a.i - b.i;
    })
    .map(({ f }) => f);
  return (
    <div className="grid gap-4">
      {visible.map((f) => (
        <FieldRow
          key={f.name}
          field={f}
          value={value?.[f.name]}
          onChange={(v) => setField(f.name, v)}
          parentValues={parentValues}
          localObject={value}
          onReplaceParentArray={onReplaceParentArray}
          runtime={runtime}
          pathPrefix={pathPrefix}
        />
      ))}
    </div>
  );
}

function showWhenMet(field: BodyField, siblings: Record<string, unknown> | undefined): boolean {
  if (!field.showWhen) return true;
  const sibling = siblings?.[field.showWhen.field];
  const want = Array.isArray(field.showWhen.equals)
    ? field.showWhen.equals
    : [field.showWhen.equals];
  return typeof sibling === "string" && want.includes(sibling);
}

function FieldRow({
  field,
  value,
  onChange,
  parentValues,
  localObject,
  onReplaceParentArray,
  runtime,
  pathPrefix = "body",
}: {
  field: BodyField;
  value: unknown;
  onChange: (v: unknown) => void;
  parentValues?: FormValues;
  /** Immediate siblings of this field — passed down so pickers can resolve body-mode parentParams. */
  localObject?: Record<string, unknown>;
  onReplaceParentArray?: (items: unknown[]) => void;
  runtime?: RuntimeFieldsControl;
  pathPrefix?: string;
}) {
  // Only primitive fields can be flagged "ask at run time" — wrapping objects/arrays in
  // a toggle doesn't make sense (the user can mark the leaves they care about instead).
  const isPrimitive = field.kind !== "object" && field.kind !== "array";
  const runtimePath = isPrimitive ? `${pathPrefix}.${field.name}` : undefined;
  const isRuntime = !!(runtime && runtimePath && runtime.paths.has(runtimePath));

  const label = (
    <div className="flex flex-wrap items-center gap-2">
      <Label>{field.label ?? field.name}</Label>
      <Pill tone="neutral">{field.kind}</Pill>
      {field.required && (
        <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
          Required
        </span>
      )}
      {runtime && runtimePath && (
        <RuntimeToggle active={isRuntime} onClick={() => runtime.onToggle(runtimePath)} />
      )}
      {runtime && runtimePath && (field.kind === "string" || field.kind === "uuid") && (
        <AutoUuidToggle
          active={runtime.autoUuid.has(runtimePath)}
          onClick={() => runtime.onToggleAutoUuid(runtimePath)}
        />
      )}
      {runtime && isPrimitive && (field.kind === "string" || field.kind === "uuid") && (
        <GenerateUniqueButton onGenerate={(v) => onChange(v)} />
      )}
    </div>
  );

  // Object and array fields render full-width with their own internal layout.
  if (field.kind === "object") {
    const obj = (
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {}
    ) as Record<string, unknown>;
    return (
      <section className="rounded-lg border border-muted-300/60 bg-surface p-3">
        <div className="mb-2">{label}</div>
        {field.description && <p className="mb-3 text-xs text-muted-500">{field.description}</p>}
        <BodyForm
          schema={field.fields ?? []}
          value={obj}
          onChange={(v) => onChange(isEmpty(v) ? undefined : v)}
          parentValues={parentValues}
          runtime={runtime}
          pathPrefix={`${pathPrefix}.${field.name}`}
        />
      </section>
    );
  }

  if (field.kind === "array") {
    const arr = (Array.isArray(value) ? value : []) as unknown[];
    // multiPicker fields trade the "+ Add item / edit each field" UX for a curated
    // dropdown of options fetched from another endpoint, with chip-style remove. Used
    // for the experts field on agents.create / agents.update — same mental model as
    // the Corti console's expert library picker.
    if (field.multiPicker) {
      return (
        <section className="rounded-lg border border-muted-300/60 bg-surface p-3">
          <div className="mb-2">{label}</div>
          {field.description && <p className="mb-3 text-xs text-muted-500">{field.description}</p>}
          <MultiPicker
            config={field.multiPicker}
            value={arr}
            onChange={(next) => onChange(isEmpty(next) ? undefined : next)}
            parentValues={parentValues}
          />
        </section>
      );
    }
    return (
      <section className="rounded-lg border border-muted-300/60 bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          {label}
          <button
            onClick={() => onChange([...arr, defaultForField(field.item)])}
            className="rounded-lg border border-muted-300 bg-paper px-2 py-1 text-xs hover:bg-paper-muted"
          >
            + Add item
          </button>
        </div>
        {field.description && <p className="mb-3 text-xs text-muted-500">{field.description}</p>}
        {arr.length === 0 && <div className="text-xs text-muted-500">No items.</div>}
        <div className="grid gap-3">
          {arr.map((item, idx) => (
            <ArrayItem
              key={idx}
              index={idx}
              field={field.item!}
              value={item}
              onChange={(v) => {
                const next = arr.slice();
                if (v === undefined) next.splice(idx, 1);
                else next[idx] = v;
                onChange(next);
              }}
              onRemove={() => {
                const next = arr.slice();
                next.splice(idx, 1);
                onChange(next);
              }}
              parentValues={parentValues}
              onReplaceArray={(items) => onChange(items)}
            />
          ))}
        </div>
      </section>
    );
  }

  // Stacked layout (label above input) for primitives. The previous side-by-side layout
  // pinched the input to ~calc(100% - 180px) and wrapped long chip rows. Full-width inputs
  // also give pickers room to render their parent-missing/empty states without squashing.
  const pickerMode = field.pickerMode ?? "replace";
  return (
    <div className="grid gap-1.5">
      <div>{label}</div>
      <div className="grid gap-2">
        {field.picker && pickerMode === "replace" && (
          <ParamPicker
            picker={field.picker}
            value={(value as string) ?? ""}
            onChange={(v) => onChange(v || undefined)}
            parentValues={parentValues}
            localObject={localObject}
            onReplaceParentArray={onReplaceParentArray}
          />
        )}
        {field.picker && pickerMode === "helper" && (
          <div className="rounded-lg border border-dashed border-muted-300 bg-paper-muted p-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-500">
              Import
            </div>
            <ParamPicker
              picker={field.picker}
              value={(value as string) ?? ""}
              onChange={(v) => onChange(v || undefined)}
              parentValues={parentValues}
              localObject={localObject}
              onReplaceParentArray={onReplaceParentArray}
            />
          </div>
        )}
        {(!field.picker || pickerMode === "helper") && (
          <PrimitiveInput field={field} value={value} onChange={onChange} />
        )}
        {field.description && <p className="text-xs text-muted-500">{field.description}</p>}
      </div>
    </div>
  );
}

function ArrayItem({
  index,
  field,
  value,
  onChange,
  onRemove,
  parentValues,
  onReplaceArray,
}: {
  index: number;
  field: BodyField;
  value: unknown;
  onChange: (v: unknown) => void;
  onRemove: () => void;
  parentValues?: FormValues;
  onReplaceArray?: (items: unknown[]) => void;
}) {
  if (field.kind === "object") {
    const obj = (
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {}
    ) as Record<string, unknown>;
    return (
      <div className="rounded-lg border border-muted-300/60 bg-paper p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-500">
            #{index + 1}
          </span>
          <button
            onClick={onRemove}
            className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
          >
            Remove
          </button>
        </div>
        <BodyForm
          schema={field.fields ?? []}
          value={obj}
          onChange={(v) => onChange(isEmpty(v) ? undefined : v)}
          parentValues={parentValues}
          onReplaceParentArray={onReplaceArray}
        />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
      <PrimitiveInput field={field} value={value} onChange={onChange} />
      <button
        onClick={onRemove}
        className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
      >
        Remove
      </button>
    </div>
  );
}

function PrimitiveInput({
  field,
  value,
  onChange,
}: {
  field: BodyField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const placeholder =
    field.example !== undefined && field.example !== null
      ? typeof field.example === "string"
        ? field.example
        : JSON.stringify(field.example)
      : "";

  if (field.kind === "enum") {
    return <EnumInput field={field} value={value} onChange={onChange} placeholder={placeholder} />;
  }

  if (field.kind === "boolean") {
    const v = value === true ? "true" : value === false ? "false" : "";
    return (
      <Select
        value={v}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next === "true" ? true : next === "false" ? false : undefined);
        }}
      >
        <option value="">— unset —</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </Select>
    );
  }

  if (field.kind === "number") {
    return (
      <Input
        type="number"
        value={(value as number | string | undefined) ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") onChange(undefined);
          else {
            const n = Number(v);
            onChange(Number.isNaN(n) ? v : n);
          }
        }}
        placeholder={placeholder}
      />
    );
  }

  if (field.kind === "string" && field.multiline) {
    return (
      <Textarea
        rows={field.rows ?? 3}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={placeholder}
      />
    );
  }

  if (field.kind === "json") {
    // JSON-valued field — textarea displays pretty-printed JSON when value is an object/array,
    // raw text when value is a string. Parses back to a JS value on each edit (so what you see
    // is what gets sent: strings serialize as `"…"`, objects as `{…}`).
    const display =
      typeof value === "string"
        ? value
        : value === undefined || value === null
          ? ""
          : JSON.stringify(value, null, 2);
    return (
      <Textarea
        rows={field.rows ?? 6}
        className="font-mono text-xs"
        value={display}
        onChange={(e) => {
          const text = e.target.value;
          if (!text) return onChange(undefined);
          try {
            onChange(JSON.parse(text));
          } catch {
            // Invalid JSON — keep as plain string so the user doesn't lose their edits.
            onChange(text);
          }
        }}
        placeholder={placeholder}
      />
    );
  }

  // string | uuid | datetime — all simple text inputs but with mono font for the codey ones.
  // Datetime fields get a "Now" shortcut button that fills in the current ISO 8601 timestamp.
  const isCodey = field.kind === "uuid" || field.kind === "datetime";
  const input = (
    <Input
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder={placeholder}
      className={isCodey ? "font-mono" : ""}
    />
  );
  if (field.kind === "datetime") {
    return (
      <div className="flex items-stretch gap-2">
        <div className="flex-1">{input}</div>
        <button
          type="button"
          onClick={() => onChange(new Date().toISOString())}
          title="Fill in the current UTC timestamp"
          className="whitespace-nowrap rounded-lg border border-muted-300 bg-paper px-3 text-xs font-medium text-ink hover:bg-paper-muted"
        >
          Now
        </button>
      </div>
    );
  }
  return input;
}

function EnumInput({
  field,
  value,
  onChange,
  placeholder,
}: {
  field: BodyField;
  value: unknown;
  onChange: (v: unknown) => void;
  placeholder?: string;
}) {
  const enumValues = field.enum ?? [];
  const isKnown = typeof value === "string" && value !== "" && enumValues.includes(value);
  // If the current value isn't one of the enum options, default to manual mode so the value stays visible.
  const [manual, setManual] = useState<boolean>(
    !!field.allowCustom && typeof value === "string" && value !== "" && !isKnown,
  );

  if (manual && field.allowCustom) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder={placeholder}
          className="font-mono"
        />
        <button
          onClick={() => setManual(false)}
          className="whitespace-nowrap rounded-lg border border-muted-300 px-2 py-1 text-xs text-muted-700 hover:bg-paper-muted"
        >
          Use dropdown
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      >
        <option value="">— unset —</option>
        {enumValues.map((opt) => (
          <option key={opt} value={opt}>
            {field.enumLabels?.[opt] ?? opt}
          </option>
        ))}
      </Select>
      {field.allowCustom && (
        <button
          onClick={() => setManual(true)}
          className="whitespace-nowrap rounded-lg border border-muted-300 px-2 py-1 text-xs text-muted-700 hover:bg-paper-muted"
        >
          Manual
        </button>
      )}
    </div>
  );
}

// ---- helpers ----

export function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") {
    return Object.values(v as Record<string, unknown>).every(isEmpty);
  }
  return false;
}

export function pruneEmpty(v: unknown): unknown {
  if (Array.isArray(v)) {
    const next = v.map(pruneEmpty).filter((x) => !isEmpty(x));
    return next.length ? next : undefined;
  }
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const pruned = pruneEmpty(val);
      if (!isEmpty(pruned)) out[k] = pruned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return v;
}

// Schema-aware filter applied to the body just before sending. Walks the schema
// (NOT the body) so that:
//  • fields flagged `wireOmit` are dropped (UI-only helpers like "pick an interaction
//    to scope a doc dropdown")
//  • fields whose `showWhen` discriminator isn't satisfied are dropped (stale state
//    from toggling enum types doesn't leak into the request)
// Recurses into nested objects and arrays of objects.
export function stripBySchema(schema: BodyField[], body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const obj = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of schema) {
    if (field.wireOmit) continue;
    if (field.showWhen) {
      const sibling = obj[field.showWhen.field];
      const want = Array.isArray(field.showWhen.equals)
        ? field.showWhen.equals
        : [field.showWhen.equals];
      if (typeof sibling !== "string" || !want.includes(sibling)) continue;
    }
    const v = obj[field.name];
    if (v === undefined) continue;
    if (field.kind === "object" && field.fields) {
      out[field.name] = stripBySchema(field.fields, v);
    } else if (
      field.kind === "array" &&
      field.item &&
      field.item.kind === "object" &&
      field.item.fields
    ) {
      out[field.name] = (Array.isArray(v) ? v : []).map((item) =>
        stripBySchema(field.item!.fields!, item),
      );
    } else {
      out[field.name] = v;
    }
  }
  return out;
}

function defaultForField(field?: BodyField): unknown {
  if (!field) return "";
  if (field.kind === "object") return {};
  if (field.kind === "array") return [];
  return "";
}

// Walks the schema and fills in every field with its `example` value (or first enum value).
// Used by the "Use test data" button to bootstrap a complete body.
export function buildExampleBody(schema: BodyField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of schema) {
    const v = exampleValueFor(f);
    if (v !== undefined) out[f.name] = v;
  }
  return out;
}

function exampleValueFor(field: BodyField): unknown {
  switch (field.kind) {
    case "object":
      return buildExampleBody(field.fields ?? []);
    case "array":
      if (Array.isArray(field.example) && field.example.length) return field.example;
      if (field.item) {
        const item = exampleValueFor(field.item);
        return item === undefined ? [] : [item];
      }
      return [];
    case "enum":
      if (field.example !== undefined) return field.example;
      return field.enum?.[0];
    default:
      return field.example;
  }
}

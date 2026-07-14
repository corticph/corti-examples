import { useState } from "react";
import type {
  BodyField,
  EndpointDef,
  FormValues,
  MultipartField,
  ParamSpec,
} from "../endpoints/types";
import { BodyForm, buildExampleBody } from "./BodyForm";
import { JsonEditor } from "./JsonEditor";
import { ParamPicker } from "./ParamPicker";
import { Input, Label } from "./ui/Input";
import { Pill } from "./ui/Pill";

// Renders the request-shaping UI (Params / Headers / Body) for a given endpoint, driven
// by a FormValues object. Used both by RequestRunner (top-level endpoint pages) and by
// NodeEditor in the workflow designer — so a node's input fields look identical to the
// endpoint page's input fields.
//
// What's NOT here: the Send button, response panel, URL preview. Those belong to the
// host because workflows run multiple endpoints together with their own controls.

type BodyTab = "form" | "json";

/**
 * Workflow-specific control surface. When present, every input renders small toggles:
 *   - ☆ runtime  → ask in the pre-run modal each run (paths set)
 *   - ✦ auto-uuid → silently overwrite with a fresh UUID each run (autoUuid set)
 *
 * The two are independent flags per path. If both are on, auto-uuid wins — the modal
 * skips that field because its value will be overwritten anyway.
 *
 * RequestRunner doesn't pass this; its inputs are always sent as-is.
 */
export type RuntimeFieldsControl = {
  paths: Set<string>;
  onToggle: (path: string) => void;
  autoUuid: Set<string>;
  onToggleAutoUuid: (path: string) => void;
};

export type EndpointFormProps = {
  endpoint: EndpointDef;
  values: FormValues;
  /** Receives a partial patch each change — host merges into FormValues. */
  onChange: (patch: Partial<FormValues>) => void;
  files: Record<string, File | undefined>;
  onFile: (name: string, file: File | undefined) => void;
  /** Show the "Use test data" button on JSON bodies that have a schema. */
  showTestDataButton?: boolean;
  /** Optional descriptive prefix shown above the Body section (e.g. interpolation hint). */
  bodyHint?: React.ReactNode;
  /** When set, renders an "ask at run time" toggle on each field. Workflow-only. */
  runtime?: RuntimeFieldsControl;
};

export function EndpointForm({
  endpoint,
  values,
  onChange,
  files,
  onFile,
  showTestDataButton = true,
  bodyHint,
  runtime,
}: EndpointFormProps) {
  const schema: BodyField[] | undefined =
    endpoint.body?.kind === "json" ? endpoint.body.schema : undefined;
  const hasSchema = !!schema && schema.length > 0;
  const [bodyTab, setBodyTab] = useState<BodyTab>(hasSchema ? "form" : "json");

  function setPath(name: string, v: string) {
    onChange({ path: { ...values.path, [name]: v } });
  }
  function setQuery(name: string, v: string) {
    onChange({ query: { ...values.query, [name]: v } });
  }
  function setHeader(name: string, v: string) {
    onChange({ headers: { ...values.headers, [name]: v } });
  }
  function setMultipartText(name: string, v: string) {
    onChange({
      body: { ...(typeof values.body === "string" ? {} : values.body), [name]: v },
    });
  }

  function applyTestData() {
    if (!hasSchema) return;
    const example = buildExampleBody(schema!);
    onChange({ body: JSON.stringify(example, null, 2) });
    setBodyTab("form");
  }

  const hasParams = (endpoint.pathParams?.length ?? 0) + (endpoint.queryParams?.length ?? 0) > 0;
  const hasHeaders = (endpoint.headers?.length ?? 0) > 0;
  const bodyKind = endpoint.body?.kind ?? "none";

  return (
    <div className="grid gap-5">
      {hasParams && (
        <Section title="Params">
          <div className="grid gap-3">
            {(endpoint.pathParams ?? []).map((p) => (
              <ParamRow
                key={`path-${p.name}`}
                param={p}
                kind="path"
                value={values.path[p.name] ?? ""}
                onChange={(v) => setPath(p.name, v)}
                parentValues={values}
                runtime={runtime}
                runtimePath={`path.${p.name}`}
              />
            ))}
            {(endpoint.queryParams ?? []).map((p) => (
              <ParamRow
                key={`query-${p.name}`}
                param={p}
                kind="query"
                value={values.query[p.name] ?? ""}
                onChange={(v) => setQuery(p.name, v)}
                parentValues={values}
                runtime={runtime}
                runtimePath={`query.${p.name}`}
              />
            ))}
          </div>
        </Section>
      )}

      {hasHeaders && (
        <Section title="Headers">
          <div className="grid gap-3">
            {(endpoint.headers ?? []).map((p) => (
              <ParamRow
                key={`h-${p.name}`}
                param={p}
                kind="header"
                value={values.headers[p.name] ?? ""}
                onChange={(v) => setHeader(p.name, v)}
                parentValues={values}
                runtime={runtime}
                runtimePath={`headers.${p.name}`}
              />
            ))}
          </div>
        </Section>
      )}

      {bodyKind === "json" && (
        <Section title="Body">
          <div className="grid gap-3">
            {bodyHint && <div className="text-xs text-muted-500">{bodyHint}</div>}
            {hasSchema && (
              <div className="flex items-center gap-1 border-b border-muted-300/60 text-sm">
                <SubTabButton active={bodyTab === "form"} onClick={() => setBodyTab("form")}>
                  Form
                </SubTabButton>
                <SubTabButton active={bodyTab === "json"} onClick={() => setBodyTab("json")}>
                  JSON
                </SubTabButton>
              </div>
            )}
            {hasSchema && bodyTab === "form" ? (
              <div className="grid gap-3">
                {showTestDataButton && (
                  <div className="flex justify-end">
                    <button
                      onClick={applyTestData}
                      className="rounded-lg border border-muted-300 bg-paper px-3 py-1 text-xs font-medium text-ink hover:bg-paper-muted"
                    >
                      Use test data
                    </button>
                  </div>
                )}
                <BodyForm
                  schema={schema!}
                  value={parseFormValueObject(values.body)}
                  onChange={(v) =>
                    onChange({
                      // Keep the form state honest — including empty shells. Pruning of empty
                      // fields happens at send time in RequestRunner, not on every keystroke.
                      body: JSON.stringify(v, null, 2),
                    })
                  }
                  parentValues={values}
                  runtime={runtime}
                />
              </div>
            ) : (
              <JsonEditor
                value={typeof values.body === "string" ? values.body : ""}
                onChange={(v) => onChange({ body: v })}
                minHeight="240px"
              />
            )}
          </div>
        </Section>
      )}

      {bodyKind === "multipart" && (
        <Section title="Body">
          <div className="grid gap-3">
            {(endpoint.body as { kind: "multipart"; fields: MultipartField[] }).fields.map((f) => (
              <MultipartRow
                key={f.name}
                field={f}
                file={files[f.name]}
                onFile={(file) => onFile(f.name, file)}
                textValue={typeof values.body === "object" ? (values.body[f.name] ?? "") : ""}
                onText={(v) => setMultipartText(f.name, v)}
                runtime={runtime}
              />
            ))}
          </div>
        </Section>
      )}

      {bodyKind === "binary" && (
        <Section title="Body">
          <BinaryBody
            accept={(endpoint.body as { kind: "binary"; accept?: string }).accept}
            description={(endpoint.body as { kind: "binary"; description?: string }).description}
            file={files._body}
            onFile={(f) => onFile("_body", f)}
            runtime={runtime}
          />
        </Section>
      )}

      {!hasParams && !hasHeaders && bodyKind === "none" && (
        <div className="rounded-lg border border-muted-300/60 bg-paper-muted p-4 text-sm text-muted-700">
          This endpoint takes no params, headers, or body.
        </div>
      )}
    </div>
  );
}

// ---- helpers used here AND re-exported for RequestRunner ----

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-muted-300/40 bg-paper p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function SubTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-t px-3 py-1 text-xs font-medium transition-colors ${
        active ? "bg-paper-muted text-ink" : "text-muted-500 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

// JSON form body is stored as a string so the JSON editor stays the single source of truth.
// When the form view is active, we parse it back into an object on every render.
function parseFormValueObject(body: FormValues["body"]): Record<string, unknown> {
  if (typeof body !== "string") return {};
  const t = body.trim();
  if (!t) return {};
  try {
    const v = JSON.parse(t);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function ParamRow({
  param,
  value,
  onChange,
  kind,
  parentValues,
  runtime,
  runtimePath,
}: {
  param: ParamSpec;
  value: string;
  onChange: (v: string) => void;
  kind: "path" | "query" | "header";
  parentValues?: FormValues;
  runtime?: RuntimeFieldsControl;
  runtimePath?: string;
}) {
  const isRuntime = !!(runtime && runtimePath && runtime.paths.has(runtimePath));
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label>{param.name}</Label>
        <Pill tone="neutral">{kind}</Pill>
        {param.required && (
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
            Required
          </span>
        )}
        {runtime && runtimePath && (
          <RuntimeToggle active={isRuntime} onClick={() => runtime.onToggle(runtimePath)} />
        )}
        {runtime && runtimePath && (param.kind === undefined || param.kind === "string") && (
          <AutoUuidToggle
            active={runtime.autoUuid.has(runtimePath)}
            onClick={() => runtime.onToggleAutoUuid(runtimePath)}
          />
        )}
        {runtime && (param.kind === undefined || param.kind === "string") && (
          <GenerateUniqueButton onGenerate={onChange} />
        )}
      </div>
      {param.picker ? (
        <ParamPicker
          picker={param.picker}
          value={value}
          onChange={onChange}
          parentValues={parentValues}
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            isRuntime
              ? "(will be asked at run time — value above is the default)"
              : (param.placeholder ?? param.example ?? "")
          }
        />
      )}
      {param.description && <p className="text-xs text-muted-500">{param.description}</p>}
    </div>
  );
}

/**
 * Tiny "ask at run time" toggle. Star icon — filled when active, outlined when off.
 * Title attribute spells out the behavior because the icon alone isn't self-explanatory.
 */
export function RuntimeToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        active
          ? "Asked at run time — click to use the saved value instead"
          : "Use the saved value — click to ask for this field at run time"
      }
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
        active
          ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
          : "bg-paper-muted text-muted-500 hover:bg-paper-muted hover:text-ink"
      }`}
    >
      {active ? "★ runtime" : "☆ runtime"}
    </button>
  );
}

/**
 * Sticky "auto-generate a UUID at every run" toggle. When active the executor overwrites
 * this field's value with a fresh UUID right before each run — no modal, no clicks.
 * Distinct from ☆ runtime (which asks in a modal) and from "+ unique id" (which fills
 * the saved value once). The right tool for `encounter.identifier`-style fields that
 * Corti tombstones permanently.
 */
export function AutoUuidToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        active
          ? "Generating a fresh UUID at every run (overrides the saved value). Click to use the saved value instead."
          : "Auto-generate a fresh UUID at every run. No modal interaction needed."
      }
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
        active
          ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
          : "bg-paper-muted text-muted-500 hover:bg-paper-muted hover:text-ink"
      }`}
    >
      {active ? "✦ auto-uuid" : "auto-uuid"}
    </button>
  );
}

/**
 * One-shot "fill this field with a fresh unique id" button. UUID v4 from the Web Crypto
 * API, with a short timestamp-based fallback for environments where it isn't available
 * (very old browsers, http-only contexts). Sized to live next to RuntimeToggle.
 */
export function GenerateUniqueButton({ onGenerate }: { onGenerate: (value: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onGenerate(uniqueId())}
      title="Fill this field with a fresh unique id (UUID v4)"
      className="rounded bg-paper-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-500 transition-colors hover:bg-accent-soft hover:text-accent"
    >
      + unique id
    </button>
  );
}

function uniqueId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function MultipartRow({
  field,
  file,
  onFile,
  textValue,
  onText,
  runtime,
}: {
  field: MultipartField;
  file?: File;
  onFile: (f: File | undefined) => void;
  textValue: string;
  onText: (v: string) => void;
  runtime?: RuntimeFieldsControl;
}) {
  if (field.kind === "file") {
    // File fields are always asked at run time (File objects can't be persisted in
    // localStorage) — no toggle, just a notice that the upload happens at run start.
    return (
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Label>{field.name}</Label>
          <Pill tone="neutral">file</Pill>
          {field.required && (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
              Required
            </span>
          )}
          {runtime && (
            <span
              className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
              title="Files can't be persisted, so this is always uploaded at run time."
            >
              ★ runtime (auto)
            </span>
          )}
        </div>
        <input
          type="file"
          accept={field.accept}
          onChange={(e) => onFile(e.target.files?.[0])}
          className="text-sm"
        />
        {file && (
          <div className="text-xs text-muted-700">
            {file.name} · {Math.round(file.size / 1024)} KB
          </div>
        )}
        {field.description && <div className="text-xs text-muted-500">{field.description}</div>}
      </div>
    );
  }
  // Text field — toggle enabled, path is "body.{name}" (multipart bodies live there).
  const runtimePath = `body.${field.name}`;
  const isRuntime = !!(runtime && runtime.paths.has(runtimePath));
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label>{field.name}</Label>
        <Pill tone="neutral">text</Pill>
        {runtime && (
          <RuntimeToggle active={isRuntime} onClick={() => runtime.onToggle(runtimePath)} />
        )}
        {runtime && (
          <AutoUuidToggle
            active={runtime.autoUuid.has(runtimePath)}
            onClick={() => runtime.onToggleAutoUuid(runtimePath)}
          />
        )}
        {runtime && <GenerateUniqueButton onGenerate={onText} />}
      </div>
      <Input
        value={textValue}
        onChange={(e) => onText(e.target.value)}
        placeholder={
          isRuntime ? "(asked at run time — value here is the default)" : (field.description ?? "")
        }
      />
    </div>
  );
}

function BinaryBody({
  accept,
  description,
  file,
  onFile,
  runtime,
}: {
  accept?: string;
  description?: string;
  file?: File;
  onFile: (f: File | undefined) => void;
  runtime?: RuntimeFieldsControl;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 text-xs">
        <Pill tone="accent">binary</Pill>
        <span className="text-muted-500">application/octet-stream</span>
        {runtime && (
          <span
            className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
            title="Files can't be persisted, so this is always uploaded at run time."
          >
            ★ runtime (auto)
          </span>
        )}
        <div className="grow" />
        {file && (
          <button
            onClick={() => onFile(undefined)}
            className="rounded-lg border border-muted-300 px-2 py-1 text-xs text-muted-700 hover:bg-paper-muted"
          >
            Clear
          </button>
        )}
      </div>
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          file
            ? "border-accent bg-accent-soft/40"
            : "border-muted-300 bg-paper-muted hover:bg-surface"
        }`}
      >
        <input
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {file ? (
          <>
            <div className="text-base font-semibold text-ink">{file.name}</div>
            <div className="text-xs text-muted-700">
              {(file.size / (1024 * 1024)).toFixed(2)} MB · {file.type || "unknown type"}
            </div>
            <div className="mt-1 text-xs text-muted-500">Click to replace</div>
          </>
        ) : (
          <>
            <div className="text-2xl">+</div>
            <div className="text-sm font-semibold text-ink">Click to pick a file</div>
            {accept && <div className="text-xs text-muted-500">Accepts: {accept}</div>}
          </>
        )}
      </label>
      {description && <p className="text-xs text-muted-500">{description}</p>}
    </div>
  );
}

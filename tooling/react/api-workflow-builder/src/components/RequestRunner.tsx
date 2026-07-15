import { useMemo, useState } from "react";
import { useProfiles } from "../context/ProfilesContext";
import type { BodyField, EndpointDef, FormValues } from "../endpoints/types";
import { emptyValuesFor } from "../endpoints/types";
import { type ExecutionError, type ExecutionResult, executeRequest } from "../lib/requestExecutor";
import { baseUrlFor } from "../profiles/types";
import { pruneEmpty, stripBySchema } from "./BodyForm";
import { EndpointForm } from "./EndpointForm";
import { JsonEditor } from "./JsonEditor";
import { Button } from "./ui/Button";
import { Pill } from "./ui/Pill";

// Single-endpoint runner: URL preview + Send button + EndpointForm + response/error panels.
// The form-building logic lives in EndpointForm so the workflow editor's NodeEditor can
// render identical inputs without duplicating any code.
export function RequestRunner({ endpoint }: { endpoint: EndpointDef }) {
  const { active, ensureToken } = useProfiles();
  const [values, setValues] = useState<FormValues>(() => emptyValuesFor(endpoint));
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<ExecutionError | { message: string } | null>(null);
  const schema: BodyField[] | undefined =
    endpoint.body?.kind === "json" ? endpoint.body.schema : undefined;
  const hasSchema = !!schema && schema.length > 0;

  const previewUrl = useMemo(() => {
    if (!active) return endpoint.path;
    const rawBase = baseUrlFor(active.region);
    const base = endpoint.unversioned ? rawBase.replace(/\/v2$/, "") : rawBase;
    let p = endpoint.path;
    for (const [k, v] of Object.entries(values.path)) {
      if (v) p = p.replaceAll(`{${k}}`, encodeURIComponent(v));
    }
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(values.query)) if (v) qs.set(k, v);
    const q = qs.toString();
    return base + p + (q ? `?${q}` : "");
  }, [endpoint, values.path, values.query, active]);

  async function send() {
    if (!active) {
      setError({ message: "No active profile. Create one in Profiles." });
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const token = await ensureToken(active.id);
      // For JSON-bodied endpoints with a schema, prune empty fields right before sending.
      // The form keeps unpruned state so the user can see/edit empty shells; the wire payload
      // sends only what's actually filled in. Then apply any endpoint-specific reshape transform
      // (e.g. spreading a single transcript into N segment items for documents.create).
      let sendValues = values;
      if (hasSchema && typeof values.body === "string" && values.body.trim()) {
        try {
          const parsed = JSON.parse(values.body);
          let shaped: unknown = pruneEmpty(parsed) ?? {};
          // Drop schema-flagged helper fields (wireOmit) and conditionally-hidden fields (showWhen).
          shaped = stripBySchema(schema!, shaped);
          if (endpoint.preSendTransform) {
            shaped = endpoint.preSendTransform(shaped);
          }
          sendValues = { ...values, body: JSON.stringify(shaped) };
        } catch {
          // If JSON parse fails, fall through and let the executor surface the error.
        }
      }
      const r = await executeRequest({
        endpoint,
        values: sendValues,
        files,
        profile: active,
        token,
      });
      setResult(r);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("[RequestRunner] send failed", e);
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-muted-300/40 bg-paper px-3 py-2.5 shadow-sm">
        <span
          className={`shrink-0 rounded-md px-2 py-1 font-mono text-xs font-semibold ${methodChipTone(
            endpoint.method,
          )}`}
        >
          {endpoint.method}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{previewUrl}</span>
        <Button onClick={send} disabled={busy || !active}>
          {busy ? "Sending…" : "Send"}
        </Button>
      </div>

      <EndpointForm
        endpoint={endpoint}
        values={values}
        onChange={(patch) => setValues((cur) => ({ ...cur, ...patch }))}
        files={files}
        onFile={(name, file) => setFiles((cur) => ({ ...cur, [name]: file }))}
      />

      {error && <ErrorPanel error={error} />}

      {result && <ResponsePanel result={result} />}
    </div>
  );
}

function methodChipTone(method: string): string {
  switch (method) {
    case "GET":
      return "bg-accent-soft text-accent";
    case "POST":
      return "bg-emerald-100 text-emerald-900";
    case "PATCH":
    case "PUT":
      return "bg-amber-100 text-amber-900";
    case "DELETE":
      return "bg-red-100 text-red-900";
    default:
      return "bg-paper-muted text-ink";
  }
}

function ResponsePanel({ result }: { result: ExecutionResult }) {
  const isOk = result.status >= 200 && result.status < 300;
  const bodyText =
    result.body === undefined || result.body === null || result.body === ""
      ? ""
      : typeof result.body === "string"
        ? result.body
        : JSON.stringify(result.body, null, 2);
  const isEmptyBody = bodyText === "";
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Pill tone={isOk ? "good" : "bad"}>
          {result.status} {result.statusText || (isOk ? "OK" : "Error")}
        </Pill>
        <span className="text-muted-500">{result.durationMs} ms</span>
        {isEmptyBody && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
            empty body
          </span>
        )}
      </div>

      {isEmptyBody ? (
        <div className="rounded-lg border border-muted-300/60 bg-paper-muted p-3 text-sm text-muted-700">
          The response had no body. Inspect the response headers below for diagnostic clues (request
          id, content-length, server hints), or open the Vite terminal — every proxied request is
          logged there as <code>[corti-eu →]</code> / <code>[corti-eu ←]</code>.
        </div>
      ) : (
        <JsonEditor value={bodyText} readOnly minHeight="240px" />
      )}

      <details className="rounded border border-muted-300/60 bg-paper p-2 text-xs">
        <summary className="cursor-pointer font-semibold text-ink">
          Response headers ({Object.keys(result.responseHeaders).length})
        </summary>
        <pre className="mt-2 overflow-auto rounded bg-ink p-2 text-[11px] leading-tight text-paper">
          {JSON.stringify(result.responseHeaders, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function redactHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === "authorization" && v) {
      const tok = v.replace(/^Bearer\s+/i, "");
      out[k] = `Bearer ${tok.slice(0, 8)}…${tok.slice(-4)} (len ${tok.length})`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function ErrorPanel({ error }: { error: ExecutionError | { message: string } }) {
  const isExec = "kind" in error;
  const exec = isExec ? (error as ExecutionError) : undefined;
  const isNetwork = exec?.kind === "network";
  const preview = exec?.preview;

  const causeText =
    exec?.cause && exec.cause instanceof Error
      ? `${exec.cause.name}: ${exec.cause.message}`
      : exec?.cause
        ? String(exec.cause)
        : null;

  return (
    <div className="grid gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="bad">{exec?.kind ?? "error"}</Pill>
        <strong>{(error as any).name ?? "Error"}:</strong>
        <span>{error.message}</span>
      </div>

      {causeText && causeText !== error.message && (
        <div className="text-xs text-red-800">
          <span className="font-semibold">cause:</span> {causeText}
        </div>
      )}

      {isNetwork && (
        <details open className="rounded border border-red-200 bg-paper p-2 text-xs text-ink">
          <summary className="cursor-pointer font-semibold text-red-900">Likely causes</summary>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted-700">
            <li>
              <strong>CORS</strong> — the browser blocked the request because the API didn't allow{" "}
              <code>http://localhost:5173</code> as an origin. Open DevTools → Network and look for
              a red row; the response will say "CORS error" or be marked "blocked". If so, we need
              to proxy through the dev server (one-line addition to <code>vite.config.ts</code>).
            </li>
            <li>
              <strong>Network unreachable</strong> — VPN/firewall/DNS. Try{" "}
              <code>
                curl -I {preview?.url ? new URL(preview.url).origin : "https://api.eu.corti.app"}
              </code>{" "}
              from a terminal.
            </li>
            <li>
              <strong>TLS / certificate</strong> — corporate MITM proxy. Rare on personal machines.
            </li>
            <li>
              <strong>Wrong base URL</strong> — verify the region on your profile matches the
              tenant.
            </li>
          </ul>
          <p className="mt-2 text-muted-500">
            The browser's <code>TypeError: Failed to fetch</code> intentionally hides which of these
            it is. The Network tab in DevTools is the authoritative answer.
          </p>
        </details>
      )}

      {preview && (
        <details className="rounded border border-red-200 bg-paper p-2 text-xs text-ink">
          <summary className="cursor-pointer font-semibold text-red-900">Request preview</summary>
          <div className="mt-2 grid gap-2">
            <div>
              <span className="font-semibold">{preview.method}</span>{" "}
              <span className="break-all font-mono">{preview.url}</span>
            </div>
            <div>
              <div className="font-semibold">Headers</div>
              <pre className="mt-1 overflow-auto rounded bg-ink p-2 text-[11px] leading-tight text-paper">
                {JSON.stringify(redactHeaders(preview.headers), null, 2)}
              </pre>
            </div>
            {preview.body !== undefined && (
              <div>
                <div className="font-semibold">JSON body</div>
                <pre className="mt-1 overflow-auto rounded bg-ink p-2 text-[11px] leading-tight text-paper">
                  {JSON.stringify(preview.body, null, 2)}
                </pre>
              </div>
            )}
            {preview.bodyFormFields && (
              <div>
                <div className="font-semibold">Multipart fields</div>
                <pre className="mt-1 overflow-auto rounded bg-ink p-2 text-[11px] leading-tight text-paper">
                  {JSON.stringify(preview.bodyFormFields, null, 2)}
                </pre>
              </div>
            )}
            {preview.binaryFile && (
              <div>
                <div className="font-semibold">Binary body</div>
                <pre className="mt-1 overflow-auto rounded bg-ink p-2 text-[11px] leading-tight text-paper">
                  {JSON.stringify(preview.binaryFile, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

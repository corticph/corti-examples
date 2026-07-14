// Pure-ish helper that turns an EndpointDef + form values + active profile + token
// into an actual HTTP request. Used by RequestRunner (interactive UI) and the
// workflow executor (batch).

import type { EndpointDef, FormValues } from "../endpoints/types";
import type { Profile } from "../profiles/types";
import { baseUrlFor } from "../profiles/types";

export type ExecutionInput = {
  endpoint: EndpointDef;
  values: FormValues;
  /** For multipart bodies the UI keeps File handles outside FormValues. */
  files?: Record<string, File | undefined>;
  profile: Profile;
  /** Pre-minted access token. The caller is responsible for refreshing. */
  token: string;
};

export type RequestPreview = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown; // for JSON
  bodyFormFields?: { name: string; value: string | { fileName: string; size: number } }[]; // for multipart
  binaryFile?: { fileName: string; size: number; contentType: string }; // for binary
};

export type ExecutionResult = {
  preview: RequestPreview;
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  body: unknown; // parsed JSON if response was JSON, else string
  durationMs: number;
};

export type ExecutionError = Error & {
  preview?: RequestPreview;
  kind: "build" | "network" | "abort";
  cause?: unknown;
};

// Browser → Corti CORS shim: when running against api.{region}.corti.app we route through
// the Vite proxy (/corti-eu, /corti-us) so the browser only sees same-origin requests.
// Other hosts are left untouched.
function toProxyUrl(absoluteUrl: string): string {
  try {
    const u = new URL(absoluteUrl, window.location.origin);
    const m = u.hostname.match(/^api\.(eu|us)\.corti\.app$/);
    if (!m) return absoluteUrl;
    return `/corti-${m[1]}${u.pathname}${u.search}`;
  } catch {
    return absoluteUrl;
  }
}

function substitutePath(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key) => {
    const v = params[key];
    if (v === undefined || v === "") {
      throw new Error(`Missing path parameter "${key}"`);
    }
    return encodeURIComponent(v);
  });
}

function buildQueryString(query: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") params.set(k, v);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function buildPreview(input: Omit<ExecutionInput, "token">): RequestPreview {
  const { endpoint, values, files, profile } = input;
  const base = baseUrlFor(profile.region);
  // Some endpoints (notably the agentic surface) are mounted at the host root, not under /v2.
  const effectiveBase = endpoint.unversioned ? base.replace(/\/v2$/, "") : base;
  const path = substitutePath(endpoint.path, values.path ?? {});
  const url = effectiveBase + path + buildQueryString(values.query ?? {});
  const headers: Record<string, string> = {
    "Tenant-Name": profile.tenant,
  };
  for (const [k, v] of Object.entries(values.headers ?? {})) {
    if (v) headers[k] = v;
  }

  if (!endpoint.body || endpoint.body.kind === "none") {
    return { method: endpoint.method, url, headers };
  }

  if (endpoint.body.kind === "json") {
    let parsedBody: unknown;
    const raw = typeof values.body === "string" ? values.body.trim() : "";
    if (raw) {
      try {
        parsedBody = JSON.parse(raw);
      } catch (e: any) {
        throw new Error(`Body is not valid JSON: ${e.message}`);
      }
    }
    return { method: endpoint.method, url, headers, body: parsedBody };
  }

  if (endpoint.body.kind === "binary") {
    const file = files?._body;
    if (!file) throw new Error("Select a file to upload");
    return {
      method: endpoint.method,
      url,
      headers,
      binaryFile: {
        fileName: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      },
    };
  }

  // multipart
  const fields: RequestPreview["bodyFormFields"] = [];
  for (const f of endpoint.body.fields) {
    if (f.kind === "file") {
      const file = files?.[f.name];
      if (f.required && !file) throw new Error(`Missing required file "${f.name}"`);
      if (file) fields!.push({ name: f.name, value: { fileName: file.name, size: file.size } });
    } else {
      const v = (values.body as Record<string, string>)?.[f.name] ?? "";
      if (v) fields!.push({ name: f.name, value: v });
    }
  }
  return { method: endpoint.method, url, headers, bodyFormFields: fields };
}

export async function executeRequest(input: ExecutionInput): Promise<ExecutionResult> {
  let preview: RequestPreview;
  try {
    preview = buildPreview(input);
  } catch (e: any) {
    const err: ExecutionError = Object.assign(new Error(e?.message ?? String(e)), {
      kind: "build" as const,
      cause: e,
    });
    throw err;
  }

  const headers = { ...preview.headers };
  headers["Authorization"] = `Bearer ${input.token}`;

  let fetchBody: BodyInit | undefined;
  if (input.endpoint.body?.kind === "json" && preview.body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchBody = JSON.stringify(preview.body);
  } else if (input.endpoint.body?.kind === "binary") {
    const file = input.files?._body;
    if (!file) {
      throw Object.assign(new Error("Select a file to upload"), { kind: "build" as const });
    }
    headers["Content-Type"] = "application/octet-stream";
    fetchBody = file;
  } else if (input.endpoint.body?.kind === "multipart") {
    const form = new FormData();
    for (const f of input.endpoint.body.fields) {
      if (f.kind === "file") {
        const file = input.files?.[f.name];
        if (file) form.append(f.name, file, file.name);
      } else {
        const v = (input.values.body as Record<string, string>)?.[f.name] ?? "";
        if (v) form.append(f.name, v);
      }
    }
    fetchBody = form;
    // Don't set Content-Type — fetch sets the right multipart boundary.
  }

  const t0 = performance.now();
  let r: Response;
  try {
    r = await fetch(toProxyUrl(preview.url), {
      method: input.endpoint.method,
      headers,
      body: fetchBody,
    });
  } catch (e: any) {
    // Browser-thrown TypeError from fetch — DNS, network, or CORS. The browser
    // intentionally hides which. We surface the request preview so the user can act on it.
    const err: ExecutionError = Object.assign(new Error(e?.message ?? "Failed to fetch"), {
      kind: "network" as const,
      preview,
      cause: e,
    });
    (err as any).name = e?.name ?? "TypeError";
    throw err;
  }
  const durationMs = Math.round(performance.now() - t0);
  const text = await r.text();
  let body: unknown = text;
  const contentType = r.headers.get("content-type") ?? "";
  if (text && contentType.includes("application/json")) {
    try {
      body = JSON.parse(text);
    } catch {
      /* keep raw */
    }
  }
  const responseHeaders: Record<string, string> = {};
  r.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });

  return {
    preview,
    status: r.status,
    statusText: r.statusText,
    responseHeaders,
    body,
    durationMs,
  };
}

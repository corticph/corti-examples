import type { NodeErrorDetail } from "./types";

// Build a single text blob from a NodeErrorDetail suitable for pasting into a bug report
// or support ticket. Authorization is redacted — the rest is verbatim so a recipient can
// reproduce or diagnose without the user manually reconstructing the request.

function redactHeaders(h: Record<string, string> | undefined): Record<string, string> {
  if (!h) return {};
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

function stringifyBody(body: unknown): string {
  if (body === undefined || body === null) return "(none)";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

export function formatErrorForCopy(detail: NodeErrorDetail): string {
  const lines: string[] = [];
  lines.push(`[${detail.timestamp}]`);
  lines.push(`${detail.name}: ${detail.message}`);
  if (detail.kind) lines.push(`kind: ${detail.kind}`);

  if (detail.preview) {
    lines.push("");
    lines.push("Request:");
    lines.push(`  ${detail.preview.method} ${detail.preview.url}`);
    const headers = redactHeaders(detail.preview.headers);
    if (Object.keys(headers).length) {
      lines.push("  Headers:");
      for (const [k, v] of Object.entries(headers)) lines.push(`    ${k}: ${v}`);
    }
    if (detail.preview.body !== undefined) {
      lines.push("  Body:");
      lines.push(indent(stringifyBody(detail.preview.body), "    "));
    }
    if (detail.preview.bodyFormFields && detail.preview.bodyFormFields.length) {
      lines.push("  Multipart fields:");
      for (const { name, value } of detail.preview.bodyFormFields) {
        const v = typeof value === "string" ? value : `(file: ${value.fileName}, ${value.size} B)`;
        lines.push(`    ${name}: ${v}`);
      }
    }
    if (detail.preview.binaryFile) {
      lines.push("  Binary body:");
      lines.push(indent(stringifyBody(detail.preview.binaryFile), "    "));
    }
  }

  if (detail.response) {
    lines.push("");
    lines.push("Response:");
    lines.push(`  ${detail.response.status} ${detail.response.statusText || ""}`.trimEnd());
    const headers = redactHeaders(detail.response.headers);
    if (Object.keys(headers).length) {
      lines.push("  Headers:");
      for (const [k, v] of Object.entries(headers)) lines.push(`    ${k}: ${v}`);
    }
    lines.push("  Body:");
    lines.push(indent(stringifyBody(detail.response.body), "    "));
  }

  if (detail.causeText) {
    lines.push("");
    lines.push(`Cause:\n  ${detail.causeText}`);
  }
  if (detail.stack) {
    lines.push("");
    lines.push("Stack:");
    lines.push(indent(detail.stack, "  "));
  }
  return lines.join("\n");
}

function indent(s: string, pad: string): string {
  return s
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

/**
 * Write text to the system clipboard. Returns true on success. Uses the Clipboard API
 * where available, falls back to a hidden textarea for non-secure contexts.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

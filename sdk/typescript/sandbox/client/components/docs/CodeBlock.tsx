import { Check, Copy } from "lucide-react";
import { useTheme } from "next-themes";
import { lazy, Suspense, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

// Lazy-loaded: mermaid pulls in cytoscape/d3 (several hundred KB), so it's
// only fetched when a writeup actually renders a mermaid diagram, not on
// every page load.
const MermaidBlock = lazy(() => import("./MermaidBlock"));

export interface SourceFile {
  name: string;
  code: string;
}

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function languageFor(name: string): string {
  if (name.endsWith(".tsx") || name.endsWith(".jsx")) {
    return "tsx";
  }
  if (name.endsWith(".ts")) {
    return "typescript";
  }
  if (name.endsWith(".js") || name.endsWith(".mjs")) {
    return "javascript";
  }
  if (name.endsWith(".css")) {
    return "css";
  }
  if (name.endsWith(".json")) {
    return "json";
  }
  if (name.endsWith(".md")) {
    return "markdown";
  }
  if (name.endsWith(".http") || name.endsWith(".sh")) {
    return "bash";
  }
  return "tsx";
}

/** The shared Prism renderer used by both the full code viewer and snippets. */
export function Highlighted({
  code,
  language,
  showLineNumbers = false,
  fontSize = "12.5px",
}: {
  code: string;
  language: string;
  showLineNumbers?: boolean;
  fontSize?: string;
}) {
  const { resolvedTheme } = useTheme();
  const style = resolvedTheme === "dark" ? oneDark : oneLight;
  return (
    <SyntaxHighlighter
      language={language}
      style={style}
      showLineNumbers={showLineNumbers}
      wrapLongLines={false}
      customStyle={{
        margin: 0,
        padding: "16px",
        background: "transparent",
        fontSize,
      }}
      codeTagProps={{ style: { fontFamily: MONO } }}
      lineNumberStyle={{ opacity: 0.35, minWidth: "2.25em" }}
    >
      {code}
    </SyntaxHighlighter>
  );
}

/**
 * A compact, captioned code snippet for inline use inside a writeup. No tabs,
 * no line numbers; just a small copy affordance in the corner. A snippet with
 * lang="mermaid" renders as a live diagram instead of highlighted code.
 */
export function Snippet({
  code,
  lang = "tsx",
  caption,
}: {
  code: string;
  lang?: string;
  caption?: string;
}) {
  return (
    <figure className="overflow-hidden rounded border border-border bg-card">
      {caption && (
        <figcaption className="border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {caption}
        </figcaption>
      )}
      <div className="overflow-x-auto">
        {lang === "mermaid" ? (
          <Suspense
            fallback={<div className="p-4 text-xs text-muted-foreground">Loading diagram…</div>}
          >
            <MermaidBlock code={code} />
          </Suspense>
        ) : (
          <Highlighted code={code} language={lang} />
        )}
      </div>
    </figure>
  );
}

/**
 * Docs code viewer: one or more real source files (imported via Vite `?raw`),
 * syntax-highlighted with a file-tab strip and copy-to-clipboard. Styled to the
 * corti monochrome palette, transparent background over the card, mono font.
 */
export function CodeBlock({ files }: { files: SourceFile[] }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const file = files[active] ?? files[0];

  if (!file) {
    return null;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.code);
      setCopied(true);
      toast.success(`Copied ${file.name}`);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="overflow-hidden rounded border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 pr-2">
        <div className="flex min-w-0 flex-1 items-center overflow-x-auto">
          {files.map((f, i) => (
            <button
              key={f.name}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 font-mono text-xs transition-colors",
                i === active
                  ? "border-foreground font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${file.name}`}
          className="flex shrink-0 items-center gap-1.5 rounded border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <Highlighted code={file.code} language={languageFor(file.name)} showLineNumbers />
      </div>
    </div>
  );
}

import mermaid from "mermaid";
import { useTheme } from "next-themes";
import { useEffect, useId, useRef, useState } from "react";

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * Renders a mermaid diagram from source text. Kept in its own module and
 * loaded via React.lazy from CodeBlock.tsx so the mermaid/cytoscape/d3
 * dependency chain is only fetched when a writeup actually contains a
 * mermaid diagram, instead of on every page load.
 */
export default function MermaidBlock({ code }: { code: string }) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "-");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    mermaid.initialize({
      startOnLoad: false,
      theme: resolvedTheme === "dark" ? "dark" : "default",
      securityLevel: "strict",
      fontFamily: MONO,
    });
    mermaid
      .render(`mermaid-${id}`, code)
      .then(({ svg }) => {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code, id, resolvedTheme]);

  if (error) {
    return (
      <div className="p-4 text-xs text-variant-error-foreground">
        Failed to render diagram: {error}
      </div>
    );
  }

  return <div ref={containerRef} className="flex justify-center p-4" />;
}

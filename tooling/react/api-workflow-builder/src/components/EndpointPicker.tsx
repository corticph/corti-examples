import { useEffect, useMemo, useState } from "react";
import { endpointById, endpointGroups } from "../endpoints/registry";

// Picker for the endpoint catalog. Same UX as the route-level sidebar — search,
// collapsible groups, method-tinted chips, localStorage-persisted expansion — but
// callback-driven so it can be embedded in any host (the endpoints sidebar uses it
// in nav mode, the workflow editor uses it in click-to-add mode).

export type EndpointPickerProps = {
  /** Called when the user picks an endpoint. */
  onPick: (endpointId: string) => void;
  /** Endpoint id to highlight as active (e.g. current route or last-added node). */
  activeId?: string;
  /** Storage key for the expanded-group set. Different hosts should use different keys
   *  so their expansion state doesn't bleed into each other. */
  storageKey: string;
  /** Optional className on the outer wrapper. */
  className?: string;
};

export function EndpointPicker({ onPick, activeId, storageKey, className }: EndpointPickerProps) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {}
    return new Set();
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...expanded]));
    } catch {}
  }, [expanded, storageKey]);

  // Auto-expand the active endpoint's group so the user can see where they are.
  const activeGroup = activeId ? endpointById[activeId]?.group : undefined;
  useEffect(() => {
    if (activeGroup) {
      setExpanded((cur) => (cur.has(activeGroup) ? cur : new Set([...cur, activeGroup])));
    }
  }, [activeGroup]);

  function toggleGroup(name: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }
  function expandAll() {
    setExpanded(new Set(endpointGroups.map((g) => g.name)));
  }
  function collapseAll() {
    setExpanded(new Set());
  }

  // Filter groups by query. When searching, groups auto-expand to show matches.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return endpointGroups;
    return endpointGroups
      .map((g) => ({
        ...g,
        endpoints: g.endpoints.filter(
          (e) =>
            e.label.toLowerCase().includes(needle) ||
            e.path.toLowerCase().includes(needle) ||
            e.id.toLowerCase().includes(needle) ||
            e.method.toLowerCase().includes(needle),
        ),
      }))
      .filter((g) => g.endpoints.length > 0);
  }, [q]);

  const searching = q.trim().length > 0;
  const totalShown = filtered.reduce((n, g) => n + g.endpoints.length, 0);

  return (
    <div className={className ?? ""}>
      <div className="sticky top-0 z-10 bg-paper/95 px-3 pt-3 pb-2 backdrop-blur">
        <div className="relative">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search endpoints"
            className="w-full rounded-lg border border-muted-300/60 bg-paper-muted py-1.5 pl-8 pr-3 text-sm placeholder:text-muted-500 focus:border-ink focus:bg-paper focus:outline-none"
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-500">
          <span>
            {totalShown} endpoint{totalShown === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={expandAll} className="hover:text-ink">
              Expand all
            </button>
            <span className="text-muted-300">·</span>
            <button onClick={collapseAll} className="hover:text-ink">
              Collapse all
            </button>
          </div>
        </div>
      </div>

      <nav className="px-2 pt-1 pb-6">
        {filtered.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-muted-500">No matches.</div>
        )}
        {filtered.map((g) => {
          const isOpen = searching || expanded.has(g.name);
          return (
            <section key={g.name} className="mb-1">
              <button
                onClick={() => !searching && toggleGroup(g.name)}
                aria-expanded={isOpen}
                disabled={searching}
                className={`group flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-500 transition-colors ${
                  searching ? "cursor-default" : "hover:bg-paper-muted hover:text-ink"
                }`}
              >
                <Chevron open={isOpen} />
                <span className="flex-1">{g.name}</span>
                <span className="rounded-full bg-paper-muted px-1.5 py-0.5 font-mono text-[10px] font-medium normal-case tracking-normal text-muted-700">
                  {g.endpoints.length}
                </span>
              </button>
              {isOpen && (
                <ul className="mt-0.5 mb-2 space-y-0.5">
                  {g.endpoints.map((e) => {
                    const isActive = e.id === activeId;
                    return (
                      <li key={e.id}>
                        <button
                          onClick={() => onPick(e.id)}
                          className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                            isActive
                              ? "bg-ink text-paper"
                              : "text-ink/80 hover:bg-paper-muted hover:text-ink"
                          }`}
                        >
                          <span
                            className={`mt-px inline-flex shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none ${
                              isActive ? "bg-paper/20 text-paper" : methodTone(e.method)
                            }`}
                          >
                            {e.method}
                          </span>
                          <span className="leading-snug">{e.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </nav>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-3 w-3 shrink-0 text-muted-500 transition-transform duration-150 ${
        open ? "rotate-90" : ""
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function methodTone(method: string): string {
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
    case "WSS":
      return "bg-purple-100 text-purple-900";
    default:
      return "bg-paper-muted text-muted-700";
  }
}

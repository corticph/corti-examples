import { ChevronRight, Compass, Home as HomeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useMatch } from "react-router-dom";
import {
  appletPath,
  getApplet,
  getAppletsForWorkflow,
  WORKFLOW_TABS,
  type WorkflowArea,
} from "../../applets/registry";
import { cn } from "../../lib/utils";

const WORKFLOW_AREAS = WORKFLOW_TABS.filter(
  (t): t is { id: WorkflowArea; label: string } => t.id !== "home",
);

/**
 * Persistent docs navigation: a Home link plus every applet grouped by
 * workflow area behind a collapsible header. Active item is derived from the
 * route path; its group auto-expands so it's never hidden.
 */
export function DocsSidebar() {
  const { pathname } = useLocation();
  const appletMatch = useMatch("/:workflow/:applet");
  const activeId = appletMatch?.params.applet;
  const activeArea = getApplet(activeId)?.workflow;

  const [openAreas, setOpenAreas] = useState<Set<WorkflowArea>>(
    () => new Set(activeArea ? [activeArea] : []),
  );

  useEffect(() => {
    if (!activeArea) {
      return;
    }
    setOpenAreas((prev) => (prev.has(activeArea) ? prev : new Set(prev).add(activeArea)));
  }, [activeArea]);

  const toggleArea = (id: WorkflowArea) => {
    setOpenAreas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <nav aria-label="Examples" className="flex flex-col gap-6 py-6 pr-4 text-sm">
      <Link
        to="/"
        className={cn(
          "flex items-center gap-2.5 rounded-none border-l-2 px-3 py-2 no-underline transition-colors",
          pathname === "/" && !activeId
            ? "border-corti-lime bg-accent font-medium text-foreground"
            : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )}
      >
        <HomeIcon className="h-4 w-4 shrink-0" />
        Home
      </Link>

      <Link
        to="/getting-started"
        className={cn(
          "flex items-center gap-2.5 rounded-none border-l-2 px-3 py-2 no-underline transition-colors",
          pathname === "/getting-started"
            ? "border-corti-lime bg-accent font-medium text-foreground"
            : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )}
      >
        <Compass className="h-4 w-4 shrink-0" />
        Getting started
      </Link>

      {WORKFLOW_AREAS.map((area) => {
        const applets = getAppletsForWorkflow(area.id);
        if (applets.length === 0) {
          return null;
        }
        const isOpen = openAreas.has(area.id);
        return (
          <div key={area.id} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => toggleArea(area.id)}
              aria-expanded={isOpen}
              className="flex items-center justify-between gap-2 px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>{area.label}</span>
              <ChevronRight
                className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isOpen && "rotate-90")}
              />
            </button>
            {isOpen &&
              applets.map((applet) => {
                const Icon = applet.icon;
                const selected = activeId === applet.id;
                return (
                  <Link
                    key={applet.id}
                    to={appletPath(applet)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-none border-l-2 px-3 py-2 no-underline transition-colors",
                      selected
                        ? "border-corti-lime bg-accent font-medium text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block leading-tight">{applet.title}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                        {applet.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}

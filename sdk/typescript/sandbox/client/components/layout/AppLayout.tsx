import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  RotateCw,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Outlet } from "react-router-dom";
import { configureButtonMappings } from "../../applets/device-buttons/mappingStore";
import { useAuth } from "../../context/AuthContext";
import { useSessionStatus } from "../../context/SessionStatusContext";
import { cn } from "../../lib/utils";
import { DocsSidebar } from "../docs/DocsSidebar";
import { Navbar } from "./Navbar";
import { version as sdkVersion } from "@corti/sdk/package.json";

const NAVBAR_HEIGHT = 52;

export function AppLayout() {
  const { authConfig, authenticate, isLoading, canAuthenticate } = useAuth();
  const { status } = useSessionStatus();
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const [sidebarHasMoreBelow, setSidebarHasMoreBelow] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sandbox:sidebar-collapsed") === "true",
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem("sandbox:sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current != null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      if (copyResetTimeoutRef.current != null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedId(null);
        copyResetTimeoutRef.current = null;
      }, 1500);
    } catch (error) {
      console.error("Failed to copy id", error);
    }
  };
  // The sidebar's own sticky/overflow region is capped by viewport height alone,
  // so it doesn't know about the sticky footer sitting on top of it at the
  // bottom of the screen — without this, the last ~footer-height px of sidebar
  // content is scrolled to, but rendered underneath the opaque footer.
  const [footerHeight, setFooterHeight] = useState(0);

  useEffect(() => {
    if (!authConfig.clientId && !authConfig.tenant) {
      return;
    }
    configureButtonMappings(authConfig.clientId, authConfig.tenant);
  }, [authConfig.clientId, authConfig.tenant]);

  const updateSidebarFade = useCallback(() => {
    const el = sidebarScrollRef.current;
    if (!el) {
      return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setSidebarHasMoreBelow(distanceFromBottom > 1);
  }, []);

  useEffect(() => {
    updateSidebarFade();
    const contentEl = sidebarContentRef.current;
    if (!contentEl) {
      return;
    }
    const observer = new ResizeObserver(updateSidebarFade);
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, [updateSidebarFade]);

  useLayoutEffect(() => {
    const el = footerRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      setFooterHeight(entries[0].contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sidebarMaxHeight = `calc(100vh - ${NAVBAR_HEIGHT}px - ${footerHeight}px)`;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 px-4 md:px-10">
        <aside
          className={cn(
            "hidden shrink-0 transition-[width] duration-200 ease-in-out lg:block",
            sidebarCollapsed
              ? "w-0 overflow-hidden border-0"
              : "w-72 border-r border-border",
          )}
        >
          <div
            className="sticky top-[52px]"
            style={{ maxHeight: sidebarMaxHeight }}
          >
            <div
              ref={sidebarScrollRef}
              onScroll={updateSidebarFade}
              className="themed-scrollbar overflow-y-auto"
              style={{ maxHeight: sidebarMaxHeight }}
            >
              <div ref={sidebarContentRef}>
                <DocsSidebar />
              </div>
            </div>
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[hsl(var(--canvas))] to-transparent transition-opacity",
                sidebarHasMoreBelow ? "opacity-100" : "opacity-0",
              )}
            />
          </div>
        </aside>

        <button
          type="button"
          onClick={() => setSidebarCollapsed((v) => !v)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "sticky top-[52px] z-10 hidden h-14 w-6 shrink-0 self-start items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:flex",
            sidebarCollapsed && "border-y border-r border-border bg-card",
          )}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>

        <main className="min-w-0 flex-1 pb-20">
          <Outlet />
        </main>
      </div>

      <footer
        ref={footerRef}
        className="sticky bottom-0 z-30 border-t border-border bg-card"
      >
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs text-muted-foreground md:px-10">
          <span>
            <span className="font-medium">Environment:</span>{" "}
            {authConfig.cluster}/{authConfig.tenant}
          </span>
          <span>
            <span className="font-medium">SDK:</span> v{sdkVersion}
          </span>
          <button
            type="button"
            onClick={() => authenticate().catch(() => {})}
            disabled={isLoading || !canAuthenticate}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 font-sans font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCw className="h-3 w-3" />
            )}
            Re-authenticate
          </button>
          {(() => {
            const label = status.sessionId
              ? "Session"
              : status.interactionId
                ? "Interaction"
                : null;
            const id = status.sessionId || status.interactionId;
            if (!label || !id) {
              return null;
            }
            return (
              <button
                type="button"
                onClick={() => void handleCopyId(id)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono transition-colors hover:bg-accent hover:text-foreground"
                title={`Copy ${label.toLowerCase()} ID`}
              >
                <span>
                  {label}: {id}
                </span>
                {copiedId === id ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            );
          })()}
        </div>
      </footer>
    </div>
  );
}

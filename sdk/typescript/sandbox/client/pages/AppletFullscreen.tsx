/**
 * Full-viewport page for applets whose registry placement makes them
 * reachable on `/:workflow/:applet/fullscreen` ("fullscreen" or "both").
 *
 * Renders the applet demo outside the docs shell (navbar, sidebar, footer)
 * so it fills the viewport like a standalone clinical app. The page owns:
 *   - the applet id context (session state namespacing),
 *   - the `onExit` callback (in-app button + Escape both return to docs).
 *
 * Frame by placement:
 *   - "fullscreen": full-bleed `h-dvh` fill — the applet manages its own
 *     layout and internal scrolling (workspace apps like Speech Flex).
 *   - "both": document-style frame — sticky slim header (applet title +
 *     exit button), then a scrollable centered `max-w-6xl` column so
 *     natural-flow demos read like the docs page without the docs chrome.
 *
 * Unauthenticated visitors see the applet's own empty state (the applets
 * gate themselves on `isReady`), mirroring how the docs page gates embedded
 * demos behind authentication.
 */

import { Minimize2 } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { AppletIdProvider } from "../applets/_shared/sessionState";
import { appletPath, getAppletByPath, hasFullscreenRoute } from "../applets/registry";
import NotFound from "./NotFound";

export function AppletFullscreen() {
  const { workflow, applet } = useParams();
  const def = getAppletByPath(workflow, applet);
  const navigate = useNavigate();

  // Escape returns to the docs page — unless a field/dialog handled the
  // keypress first (preventDefault) or focus is in an editable control.
  useEffect(() => {
    if (!def || !hasFullscreenRoute(def)) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) {
        return;
      }
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName))
      ) {
        return;
      }
      navigate(appletPath(def));
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [def, navigate]);

  if (!def || !hasFullscreenRoute(def)) {
    return <NotFound />;
  }

  const Demo = def.Component;
  const exitFullscreen = () => navigate(appletPath(def));

  return (
    <AppletIdProvider appletId={def.id}>
      {def.demoPlacement === "fullscreen" ? (
        <div className="h-dvh overflow-hidden bg-background">
          <Demo onExit={exitFullscreen} />
        </div>
      ) : (
        <div className="min-h-dvh bg-background">
          <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-5 border-b border-border bg-background px-6">
            <Logo className="h-[18px] w-auto shrink-0 text-foreground" />
            <span className="shrink-0 text-[13px] text-muted-foreground">{def.title}</span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" type="button" onClick={exitFullscreen}>
                <Minimize2 className="h-3.5 w-3.5" />
                Exit full screen
              </Button>
            </div>
          </div>
          <div className="mx-auto w-full max-w-6xl px-6 py-8">
            <Demo onExit={exitFullscreen} />
          </div>
        </div>
      )}
    </AppletIdProvider>
  );
}

/**
 * Full-viewport page for applets whose registry placement makes them
 * reachable on `/:workflow/:applet/fullscreen` ("fullscreen" or "both").
 *
 * Renders the applet demo outside the docs shell (sidebar, footer) so it
 * fills the viewport like a standalone app, under the same Navbar as main
 * view: the applet title renders next to the logo, and the Console / API
 * docs links are replaced by an "Exit full screen" button. The page owns:
 *   - the applet id context (session state namespacing),
 *   - the exit-full-screen handler (nav button and Escape both return to
 *     docs).
 *
 * Frame by placement:
 *   - "fullscreen": Navbar plus full-bleed fill of the remaining viewport
 *     height — the applet manages its own layout and internal scrolling
 *     (workspace apps like Speech Flex).
 *   - "both": document-style frame — the scrollable centered `max-w-6xl`
 *     column so natural-flow demos read like the docs page without the
 *     docs chrome.
 *
 * Unauthenticated visitors see the applet's own empty state (the applets
 * gate themselves on `isReady`), mirroring how the docs page gates embedded
 * demos behind authentication.
 */

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppletIdProvider } from "../applets/_shared/sessionState";
import { appletPath, getAppletByPath, hasFullscreenRoute } from "../applets/registry";
import { Navbar } from "../components/layout/Navbar";
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
      <Navbar label={def.title} onExit={exitFullscreen} />
      {def.demoPlacement === "fullscreen" ? (
        <div className="h-[calc(100dvh-52px)] overflow-hidden bg-background">
          <Demo />
        </div>
      ) : (
        <div className="min-h-[calc(100dvh-52px)] bg-background">
          <div className="mx-auto w-full max-w-6xl px-6 py-8">
            <Demo />
          </div>
        </div>
      )}
    </AppletIdProvider>
  );
}

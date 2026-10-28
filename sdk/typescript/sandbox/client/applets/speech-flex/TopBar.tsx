/**
 * TopBar — the Speech Flex capture bar, following the Corti clinical app
 * design:
 *
 *   Nav (page Navbar):  Corti logo · app label · theme toggle · exit
 *   Capture bar:  mic control, mode toggle, recording status, config
 *
 * The Nav row is the shared Navbar rendered by AppletFullscreen, which
 * owns the logo, the applet label, and the exit button; what remains here
 * is the capture bar. Its contents are passed as children by SpeechFlex
 * (the mic web component and mode toggle own live state). The selected
 * visit's identity lives in the left rail's patient context block.
 */

import type { ReactNode } from "react";

export function TopBar({
  actions,
  children,
}: {
  /** Rendered at the right end of the capture bar (config dialog, etc.). */
  actions?: ReactNode;
  /** Capture bar contents (mic control, mode toggle, recording status). */
  children?: ReactNode;
}) {
  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background px-6 py-2">
      {children}
      {actions}
    </header>
  );
}

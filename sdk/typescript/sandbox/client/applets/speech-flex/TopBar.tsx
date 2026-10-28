/**
 * TopBar — the Speech Flex app header, following the Corti clinical app
 * design:
 *
 *   Row 1 (h-12):  Corti logo · app label · tools/exit
 *   Row 2 (flex):  capture bar — mic control, mode toggle, recording status
 *
 * The capture bar contents are passed as children by SpeechFlex (the mic web
 * component and mode toggle own live state). The selected visit's identity
 * lives in the left rail's patient context block.
 */

import { Minimize2 } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "./kit";

export function TopBar({
  actions,
  onExit,
  children,
}: {
  /** Header actions rendered before the exit button (config dialog, etc.). */
  actions?: ReactNode;
  /** Present in the standalone full-screen route. Navigates back to docs. */
  onExit?: () => void;
  /** Capture bar contents (mic control, mode toggle, recording status). */
  children?: ReactNode;
}) {
  return (
    <header className="flex shrink-0 flex-col border-b border-border bg-background">
      {/* Row 1 — brand + tools */}
      <div className="flex h-12 shrink-0 items-center gap-5 px-6">
        <Logo className="h-7 w-auto shrink-0 text-foreground" />
        <span className="shrink-0 text-[13px] text-muted-foreground">Speech Flex</span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
          {onExit && (
            <Button variant="outline" size="sm" type="button" onClick={onExit}>
              <Minimize2 className="h-3.5 w-3.5" />
              Exit full screen
            </Button>
          )}
        </div>
      </div>

      {/* Row 2 — capture bar */}
      {children && (
        <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-6 py-2">
          {children}
        </div>
      )}
    </header>
  );
}

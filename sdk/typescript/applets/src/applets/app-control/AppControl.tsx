/**
 * Applet — CONCEPT: app-DOM command-and-control.
 *
 * Beyond inserting text, voice commands here drive the application itself —
 * switching tabs, opening a panel, clicking buttons, confirming a dialog. The
 * mock app registers its actionable UI as AppControls; the command handler
 * resolves each spoken target through the shared AppControlRegistry and runs it
 * (availability-gated). An "app awareness" panel reads the registry snapshot so
 * you can see, live, what's on screen and what's actionable. Dictation still
 * works (Notes tab) via the same EditorAdapter the other applets use — the two
 * halves of a Fluency-Direct integration on one surface.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  type AppControlSnapshotEntry,
  createAppControlRegistry,
} from "../_shared/app-control-adapter";
import { CortiDictationComponent } from "../_shared/corti-dictation-react";
import type { EditorAdapter } from "../_shared/editor-adapter";
import { useActiveControl } from "../_shared/useActiveControl";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { handleAppCommand } from "./commands";
import { buildDictationConfig } from "./config";
import { MockApp } from "./MockApp";

const LANGUAGE = "en";

interface LogEntry {
  id: string;
  description: string;
}

export function AppControl() {
  const { authConfig } = useCortiAccessToken();
  const containerRef = useRef<HTMLDivElement>(null);
  const { adapter } = useActiveControl(containerRef);
  const adapterRef = useRef<EditorAdapter | null>(null);
  adapterRef.current = adapter;

  const registry = useMemo(() => createAppControlRegistry(), []);
  const [snapshot, setSnapshot] = useState<AppControlSnapshotEntry[]>([]);
  const refreshSnapshot = useCallback(() => setSnapshot(registry.snapshot()), [registry]);

  const [interim, setInterim] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const pushLog = useCallback((entry: LogEntry) => {
    setLog((prev) => [entry, ...prev].slice(0, 6));
  }, []);

  const dictationConfig = useMemo(() => buildDictationConfig(LANGUAGE), []);

  const handleTranscript = useCallback((e: CustomEvent) => {
    const data = e.detail?.data;
    if (!data || Array.isArray(data)) {
      return;
    }
    if (!data.isFinal) {
      setInterim(data.text);
      return;
    }
    setInterim("");
    adapterRef.current?.insert(data.text, { primaryLanguage: LANGUAGE });
  }, []);

  const handleCommand = useCallback(
    (e: CustomEvent) => {
      const data = e.detail?.data;
      if (!data) {
        return;
      }
      const outcome = handleAppCommand(data, registry);
      pushLog({ id: data.id, description: outcome.description });
      refreshSnapshot();
    },
    [registry, pushLog, refreshSnapshot],
  );

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">App command-and-control</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Drive the application by voice — switch tabs, open the details panel, create an order and
          confirm it, or save. Dictate into the Notes tab as well; commands and dictation share one
          mic.
        </p>
      </div>

      {/* Top: the app, with the dictation mic beside it. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex-1">
          <MockApp registry={registry} onStateChange={refreshSnapshot} interim={interim} />
        </div>
        <div className="flex justify-end">
          <CortiDictationComponent
            authConfig={authConfig}
            dictationConfig={dictationConfig}
            settingsEnabled={["device", "language", "keybinding"]}
            onTranscript={handleTranscript}
            onCommand={handleCommand}
          />
        </div>
      </div>

      {/* Below: app awareness + voice commands side by side. */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <h3 className="mb-2 text-sm font-semibold text-foreground">App awareness</h3>
          <ul className="space-y-1 text-xs">
            {snapshot.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className="capitalize text-foreground">{c.label}</span>
                <span className="flex items-center gap-2">
                  {c.state && (
                    <span className="rounded bg-corti-lime/20 px-1.5 py-0.5 font-mono text-foreground">
                      {c.state}
                    </span>
                  )}
                  {!c.available && <span className="text-muted-foreground">unavailable</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md border border-border bg-muted/40 p-3">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Voice commands</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">
                “go to {"{"}tab{"}"}”
              </span>{" "}
              — overview, orders, notes.
            </li>
            <li>
              <span className="font-medium text-foreground">“open/close details”</span> — toggle the
              side panel.
            </li>
            <li>
              <span className="font-medium text-foreground">“create new order”</span> /{" "}
              <span className="font-medium text-foreground">“save note”</span> — action buttons.
            </li>
            <li>
              <span className="font-medium text-foreground">“confirm” / “cancel”</span> — only when
              the dialog is open.
            </li>
          </ul>
          {log.length > 0 && (
            <div className="mt-3 border-t border-border pt-2">
              <span className="text-xs font-medium text-muted-foreground">Recent commands</span>
              <ul className="mt-1 space-y-0.5">
                {log.map((entry, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: same command id can repeat in the log; index disambiguates
                  <li key={`${entry.id}-${i}`} className="font-mono text-xs text-muted-foreground">
                    <span className="text-foreground">{entry.id}</span> — {entry.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

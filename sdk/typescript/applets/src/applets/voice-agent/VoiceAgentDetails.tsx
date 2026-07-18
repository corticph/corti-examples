import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  applyPreset,
  clearDebugLog,
  savePrompt,
  setMinSpeculativeWords,
  setShowProvisionalDetails,
  setTurnMode,
  type TurnMode,
  useDebugLogStore,
  useVoiceAgentStore,
  VOICE_AGENT,
} from "./agent";
import { ORCHESTRATOR_KEY, SPECIALIST_KEYS, VOICE_PRESETS } from "./model";

export function VoiceAgentDetails() {
  const { prompt, presetKey, status, turnMode, minSpeculativeWords, showProvisionalDetails } =
    useVoiceAgentStore();
  const debugLog = useDebugLogStore();
  const [draft, setDraft] = useState(prompt);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => setDraft(prompt), [prompt]);

  const dirty = draft !== prompt;
  const saving = status === "preparing";

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent</p>
        <p className="mt-1 text-foreground">{VOICE_AGENT.name}</p>
        <p className="text-xs text-muted-foreground">{VOICE_AGENT.description}</p>
      </div>

      {/* Settings grid — 2×2: toggles on top row, sliders on bottom row */}
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border text-xs">
        {/* Mode toggle — top left */}
        <div className="flex flex-col gap-2 border-b border-r border-border p-3">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Mode</p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Auto-detect</span>
            <button
              type="button"
              role="switch"
              aria-checked={presetKey === ORCHESTRATOR_KEY}
              disabled={saving}
              onClick={() =>
                void applyPreset(
                  presetKey === ORCHESTRATOR_KEY ? SPECIALIST_KEYS[0] : ORCHESTRATOR_KEY,
                )
              }
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:opacity-50 ${
                presetKey === ORCHESTRATOR_KEY ? "bg-corti-lime" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  presetKey === ORCHESTRATOR_KEY ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Provisional toggle — top right */}
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Provisional</p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Show details</span>
            <button
              type="button"
              role="switch"
              aria-checked={showProvisionalDetails}
              onClick={() => setShowProvisionalDetails(!showProvisionalDetails)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
                showProvisionalDetails ? "bg-corti-lime" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  showProvisionalDetails ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Turn mode — bottom left */}
        <div className="flex flex-col gap-2 border-r border-border p-3">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Turn mode</p>
          <div className="flex gap-1">
            {(["instant", "standard", "deliberate"] as TurnMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setTurnMode(mode)}
                className={`flex-1 rounded px-1 py-1 text-[11px] font-medium capitalize transition-colors ${
                  turnMode === mode
                    ? "bg-corti-lime/20 text-foreground ring-1 ring-inset ring-corti-lime/60"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Min words slider — bottom right */}
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold uppercase tracking-wide text-muted-foreground">Min words</p>
            <span className="tabular-nums text-muted-foreground">{minSpeculativeWords}</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={minSpeculativeWords}
            onChange={(e) => setMinSpeculativeWords(Number(e.target.value))}
            className="w-full accent-corti-lime"
          />
        </div>
      </div>

      {/* Specialist presets */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Specialists
        </p>
        <div className="flex flex-wrap gap-2">
          {SPECIALIST_KEYS.map((key) => (
            <Button
              key={key}
              size="sm"
              variant={presetKey === key ? "default" : "outline"}
              onClick={() => void applyPreset(key)}
              disabled={saving}
            >
              {VOICE_PRESETS[key].label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Selecting a specialist overrides auto-detect mode. Reset the thread after switching.
        </p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            System prompt
          </p>
          <span className="text-xs text-muted-foreground">
            {saving ? "Updating agent..." : dirty ? "Unsaved changes" : ""}
          </span>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={12}
          spellCheck={false}
          className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground outline-none focus:border-corti-lime"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void savePrompt(draft)} disabled={!dirty || saving}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(prompt)} disabled={!dirty}>
            Discard
          </Button>
        </div>
      </div>

      {/* Debug log */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setDebugOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <span>Debug log ({debugLog.length} events)</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${debugOpen ? "rotate-180" : ""}`}
          />
        </button>

        {debugOpen && (
          <div className="border-t border-border p-3">
            <div className="mb-2 flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={debugLog.length === 0}
                onClick={() => {
                  const text = debugLog
                    .map(
                      (e) =>
                        `+${String(e.tMs).padStart(6)}ms  ${e.event.padEnd(24)} ${e.text}${e.latencyMs != null ? `  (${e.latencyMs}ms)` : ""}`,
                    )
                    .join("\n");
                  void navigator.clipboard.writeText(text);
                }}
              >
                Copy
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={debugLog.length === 0}
                onClick={clearDebugLog}
              >
                Clear
              </Button>
            </div>
            <pre className="max-h-72 overflow-y-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-relaxed text-foreground">
              {debugLog.length === 0
                ? "No events yet — speak to start recording."
                : debugLog
                    .map(
                      (e) =>
                        `+${String(e.tMs).padStart(6)}ms  ${e.event.padEnd(24)} ${e.text}${e.latencyMs != null ? `  (${e.latencyMs}ms)` : ""}`,
                    )
                    .join("\n")}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  applyPreset,
  savePrompt,
  setResponseDebounceMs,
  setShowProvisionalDetails,
  useVoiceAgentStore,
  VOICE_AGENT,
} from "./agent";
import { ORCHESTRATOR_KEY, SPECIALIST_KEYS, VOICE_PRESETS } from "./model";

export function VoiceAgentDetails() {
  const { prompt, presetKey, status, responseDebounceMs, showProvisionalDetails } =
    useVoiceAgentStore();
  const [draft, setDraft] = useState(prompt);

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

      {/* Settings row */}
      <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border text-xs">
        {/* Mode */}
        <div className="flex flex-col gap-2 p-3">
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

        {/* Response delay */}
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold uppercase tracking-wide text-muted-foreground">
              Response delay
            </p>
            <span className="tabular-nums text-muted-foreground">
              {(responseDebounceMs / 1000).toFixed(1)} s
            </span>
          </div>
          <input
            type="range"
            min={500}
            max={3000}
            step={100}
            value={responseDebounceMs}
            onChange={(e) => setResponseDebounceMs(Number(e.target.value))}
            className="w-full accent-corti-lime"
          />
        </div>

        {/* Provisional details */}
        <div className="flex flex-col gap-2 p-3">
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
    </div>
  );
}

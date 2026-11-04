import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  applyPreset,
  CONVERSATIONAL_AGENT,
  savePrompt,
  setConnectorsEnabled,
  setExternalAgentId,
  setTurnMode,
  type TurnMode,
  useConversationalAgentStore,
} from "./agent";
import { ORCHESTRATOR_KEY, SPECIALIST_KEYS, VOICE_PRESETS } from "./model";

export function ConversationalAgentDetails() {
  const { prompt, presetKey, status, turnMode, externalAgentId, connectorsEnabled } =
    useConversationalAgentStore();
  const [draft, setDraft] = useState(prompt);
  const [agentIdDraft, setAgentIdDraft] = useState(externalAgentId ?? "");

  useEffect(() => setDraft(prompt), [prompt]);
  useEffect(() => setAgentIdDraft(externalAgentId ?? ""), [externalAgentId]);

  const dirty = draft !== prompt;
  const saving = status === "preparing";
  const usingExternal = Boolean(externalAgentId);

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How it works
        </p>
        <ul className="ml-4 mt-1 list-disc text-muted-foreground">
          <li>
            Always-on voice chat — hold the mic button and speak freely, no wake phrase needed.
            Everything spoken is transcribed and sent to the agent, which streams its response via
            SSE for minimal latency.
          </li>
          <li>
            Turn modes control how aggressively the agent responds: instant fires on the first
            pause, standard waits a bit longer, deliberate waits for mic-off or a long silence.
          </li>
          <li>
            Auto-detect mode lets the orchestrator identify the use case from your first message and
            route to the right specialist. Pin a specialist to override auto-detection. Specialist
            presets attach registry connectors — e.g. clinical gets PubMed, pharmacy triage gets
            POSOS, CPOE capture gets coding.
          </li>
          <li>
            Paste an external agent ID to use an agent created elsewhere instead of auto-creating
            one. When set, the prompt and specialist presets are disabled.
          </li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent</p>
        <p className="mt-1 text-foreground">{CONVERSATIONAL_AGENT.name}</p>
        <p className="text-xs text-muted-foreground">{CONVERSATIONAL_AGENT.description}</p>
        <p className="text-xs text-muted-foreground">
          Model: <code>{CONVERSATIONAL_AGENT.model}</code>, lifecycle:{" "}
          <code>{CONVERSATIONAL_AGENT.lifecycle}</code>
        </p>
      </div>

      {/* External agent ID — when set, skip agent creation and use this ID directly */}
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          External agent ID
        </p>
        <div className="flex gap-2">
          <input
            value={agentIdDraft}
            onChange={(e) => setAgentIdDraft(e.target.value)}
            placeholder="Paste an agent ID to use directly…"
            spellCheck={false}
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs text-foreground outline-none focus:border-corti-lime"
          />
          <Button
            size="sm"
            onClick={() => setExternalAgentId(agentIdDraft.trim() || null)}
            disabled={agentIdDraft.trim() === (externalAgentId ?? "").trim()}
          >
            {usingExternal ? "Update" : "Use"}
          </Button>
          {usingExternal && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAgentIdDraft("");
                setExternalAgentId(null);
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {usingExternal
            ? "Using external agent. Prompt and specialists are disabled."
            : "Leave empty to auto-create an agent from the prompt below."}
        </p>
      </div>

      {/* Settings — mode toggle, turn mode, connectors toggle */}
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border text-xs">
        {/* Mode toggle */}
        <div className="flex flex-col gap-2 border-b border-r border-border p-3">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Mode</p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Auto-detect</span>
            <button
              type="button"
              role="switch"
              aria-checked={presetKey === ORCHESTRATOR_KEY}
              disabled={saving || usingExternal}
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

        {/* Turn mode */}
        <div className="flex flex-col gap-2 border-b border-border p-3">
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

        {/* Connectors toggle — spans both columns */}
        <div className="flex items-center justify-between gap-2 p-3">
          <div>
            <p className="font-semibold uppercase tracking-wide text-muted-foreground">
              Connectors
            </p>
            <p className="text-muted-foreground">
              Attach registry connectors (PubMed, POSOS, coding) to specialist presets
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={connectorsEnabled}
            disabled={saving || usingExternal}
            onClick={() => setConnectorsEnabled(!connectorsEnabled)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:opacity-50 ${
              connectorsEnabled ? "bg-corti-lime" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                connectorsEnabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Specialist presets */}
      <div className={usingExternal ? "opacity-40" : ""}>
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
              disabled={saving || usingExternal}
            >
              {VOICE_PRESETS[key].label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Selecting a specialist overrides auto-detect mode and attaches its connectors. Reset the
          thread after switching.
        </p>
      </div>

      <div className={usingExternal ? "opacity-40" : ""}>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            System prompt
          </p>
          <span className="text-xs text-muted-foreground">
            {usingExternal
              ? "Managed externally"
              : saving
                ? "Updating agent..."
                : dirty
                  ? "Unsaved changes"
                  : ""}
          </span>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={12}
          spellCheck={false}
          disabled={usingExternal}
          className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground outline-none focus:border-corti-lime disabled:cursor-not-allowed"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => void savePrompt(draft)}
            disabled={!dirty || saving || usingExternal}
          >
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

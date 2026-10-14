/**
 * Applet: real-time CDI nudges during documentation.
 *
 * The clinician types or dictates into a contentEditable editor. A cadence
 * detector watches for sentence completions, line/paragraph breaks, and
 * edits. After a debounce, the nudge engine evaluates the text against the
 * active rule set and surfaces non-blocking "chirps" when a documentation
 * gap is detected — e.g., "CHF documented without type or acuity."
 *
 * Subtle, in-flow feedback, not hard-stop alerts. Text matching uses a
 * grammar model (optional, alternation, self-references); SNOMED-CT code
 * prediction and a Corti agent handle code-based rule evaluation.
 */

import type { Corti } from "@corti/sdk";
import { CortiClient } from "@corti/sdk";
import {
  Bird,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover";
import { dispatchCommand } from "../_shared/commandDispatch";
import { CortiDictationComponent } from "../_shared/cortiDictationReact";
import type { EditorAdapter } from "../_shared/editorAdapter";
import type { Range } from "../_shared/offsetMap";
import { useActiveControl } from "../_shared/useActiveControl";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useDictationLanguage } from "../_shared/useDictationLanguage";
import {
  useHidCommandCatalog,
  useHidCommandHandler,
} from "../_shared/useDictationDevice";
import { cn } from "../_shared/utils";
import {
  buildRegistry,
  TEMPLATES,
  toTranscribeCommands,
} from "../dictation-commands/commandModel";
import {
  clearLog,
  logCommand,
  setIdentity as setCommandIdentity,
  useCommandStore,
} from "../dictation-commands/commandStore";
import { buildSuiteConfig } from "../dictation-suite/suiteConfig";
import { termStore } from "../dictionary-terms/terms";
import { replacementStore } from "../text-replacements/replacements";
import { nudgeConnectionState } from "./connectionState";
import { loadSettings, NudgeConfig, type NudgeSettings } from "./NudgeConfig";
import { NudgeRuleEditor } from "./NudgeRuleEditor";
import { type NudgeRule, nudgeRuleStore } from "./nudgeRules";
import { invalidateCache, predictCodes } from "./predictCodes";
import {
  type AgentNudgeRequest,
  type AgentNudgeResponse,
  clearDebugLog,
  configureNudgeAgent,
  DEFAULT_SYSTEM_PROMPT,
  evaluateCodesWithAgent,
  evaluatePromptWithAgent,
  invalidateAgentCache,
  invalidatePromptAgentCache,
  logSessionConfig,
  type NudgeDebugEntry,
  type PromptEvalRequest,
  type PromptEvalResponse,
  resetAgentPrompt,
  resetNudgeAgentSession,
  saveAgentPrompt,
  useNudgeAgentPrompt,
  useNudgeDebugLog,
} from "./snomedAgent";
import { type UseNudgesOptions, useNudges } from "./useNudges";

// A sample note can be added here for the editor to seed on first mount. This would support testing and demo purposes, so the user doesn't have to type or dictate to see nudges.
const SAMPLE_NOTE = ``;

function formatDebugTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:${pad(d.getMilliseconds(), 3)}`;
}

function DebugLogRow({ entry }: { entry: NudgeDebugEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = entry.text.length > 120 || entry.data !== undefined;

  return (
    <div>
      {hasDetail ? (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-baseline gap-2 text-left text-xs"
        >
          <span className="shrink-0 font-mono text-muted-foreground">
            {formatDebugTime(entry.at)}
          </span>
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              "shrink-0 rounded px-1 text-[10px] font-semibold",
              entry.type === "predict-request" &&
                "bg-blue-500/10 text-blue-600 dark:text-blue-400",
              entry.type === "predict-response" &&
                "bg-blue-500/10 text-blue-600 dark:text-blue-400",
              entry.type === "agent-request" &&
                "bg-purple-500/10 text-purple-600 dark:text-purple-400",
              entry.type === "agent-response" &&
                "bg-purple-500/10 text-purple-600 dark:text-purple-400",
              entry.type === "prompt-request" &&
                "bg-amber-500/10 text-amber-600 dark:text-amber-400",
              entry.type === "prompt-response" &&
                "bg-amber-500/10 text-amber-600 dark:text-amber-400",
              entry.type === "nudge-update" &&
                "bg-lime-600/15 text-lime-700 dark:bg-corti-lime/10 dark:text-corti-lime",
            )}
          >
            {entry.type}
          </span>
          <span className="truncate text-foreground">{entry.text}</span>
        </button>
      ) : (
        <div className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 font-mono text-muted-foreground">
            {formatDebugTime(entry.at)}
          </span>
          <span
            className={cn(
              "shrink-0 rounded px-1 text-[10px] font-semibold",
              entry.type === "predict-request" &&
                "bg-blue-500/10 text-blue-600 dark:text-blue-400",
              entry.type === "predict-response" &&
                "bg-blue-500/10 text-blue-600 dark:text-blue-400",
              entry.type === "agent-request" &&
                "bg-purple-500/10 text-purple-600 dark:text-purple-400",
              entry.type === "agent-response" &&
                "bg-purple-500/10 text-purple-600 dark:text-purple-400",
              entry.type === "prompt-request" &&
                "bg-amber-500/10 text-amber-600 dark:text-amber-400",
              entry.type === "prompt-response" &&
                "bg-amber-500/10 text-amber-600 dark:text-amber-400",
              entry.type === "nudge-update" &&
                "bg-lime-600/15 text-lime-700 dark:bg-corti-lime/10 dark:text-corti-lime",
            )}
          >
            {entry.type}
          </span>
          <span className="truncate text-foreground">{entry.text}</span>
        </div>
      )}
      {expanded && hasDetail && (
        <pre className="ml-10 mt-0.5 max-h-48 overflow-auto rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">
          {entry.data !== undefined
            ? JSON.stringify(entry.data, null, 2)
            : entry.text}
        </pre>
      )}
    </div>
  );
}

function AgentPromptTextarea({
  prompt,
  defaultPrompt,
  status,
  onSave,
  onReset,
}: {
  prompt: string;
  defaultPrompt: string;
  status: string;
  onSave: (prompt: string) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState(prompt);

  useEffect(() => {
    setDraft(prompt);
  }, [prompt]);

  const dirty = draft !== prompt;

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={10}
        spellCheck={false}
        className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground outline-none focus:border-corti-lime"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => onSave(draft)}
          disabled={!dirty || status === "preparing"}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onReset}
          disabled={status === "preparing"}
        >
          Reset to default
        </Button>
      </div>
      {draft !== defaultPrompt && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Differs from the built-in default.
        </p>
      )}
    </div>
  );
}

/** Predict without filters so absence checks retain full requested-system coverage. */
function buildPredictParams(
  rules: NudgeRule[],
  snomedEnabled: boolean,
  icd10Enabled: boolean,
): { systems: string[] } | null {
  const hasSnomedRules = rules.some(
    (r) => r.enabled && (r.trigger.snomed || r.resolve.snomed),
  );
  const hasIcd10Rules = rules.some(
    (r) => r.enabled && (r.trigger.icd10 || r.resolve.icd10),
  );

  const wantSnomed = snomedEnabled && hasSnomedRules;
  const wantIcd10 = icd10Enabled && hasIcd10Rules;

  if (!wantSnomed && !wantIcd10) {
    return null;
  }

  if (wantSnomed && !wantIcd10) {
    return { systems: ["snomedctint"] };
  }
  if (wantIcd10 && !wantSnomed) {
    return { systems: ["icd10cm-outpatient"] };
  }
  // Both enabled — batch but no filter (system-specific codes would fail validation)
  return { systems: ["snomedctint", "icd10cm-outpatient"] };
}

export function RealTimeNudge() {
  const {
    authConfig,
    clientId,
    environment,
    sdkEnvironment,
    tenantName,
    isReady,
  } = useCortiAccessToken();
  // isReady is temporarily false while an existing token refreshes. That is
  // not a logout and must not reset caches, agent revisions, or cadence.
  const { available: hasAccessToken, scope: connectionScope } =
    nudgeConnectionState({
      authConfig,
      environment,
      tenantName,
      clientId,
      isReady,
    });
  const { language, onLanguagesChanged } = useDictationLanguage();

  const editorColumnRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const { adapter } = useActiveControl(editorColumnRef);
  const adapterRef = useRef<EditorAdapter | null>(null);
  adapterRef.current = adapter;

  const rules = nudgeRuleStore.useItems();
  const { commands, log } = useCommandStore();
  const replacements = replacementStore.useItems();
  const terms = termStore.useItems();
  const [settings, setSettings] = useState<NudgeSettings>(loadSettings);

  // Invalidate predict cache when code system toggles change.
  useEffect(() => {
    invalidateCache();
  }, [settings.snomedEnabled, settings.icd10Enabled]);

  // Changing cache policy discards completed agent results without depending on callback identity.
  useEffect(() => {
    invalidateAgentCache();
    invalidatePromptAgentCache();
  }, [settings.agentEnabled, settings.agentCached]);

  // Create a CortiClient for agent calls (re-created when auth changes).
  const clientRef = useRef<CortiClient | null>(null);
  useEffect(() => {
    if (hasAccessToken && authConfig && sdkEnvironment) {
      clientRef.current = new CortiClient({
        environment: sdkEnvironment,
        auth: authConfig,
      });
    } else {
      clientRef.current = null;
    }
  }, [hasAccessToken, authConfig, sdkEnvironment]);

  const codePredict = useCallback(
    async (
      text: string,
      evaluationId?: string,
    ): Promise<Corti.CodesGeneralResponse | null> => {
      if (!authConfig.accessToken || !text.trim()) {
        return null;
      }
      const client = clientRef.current;
      if (!client) {
        return null;
      }
      const params = buildPredictParams(
        rules,
        settings.snomedEnabled,
        settings.icd10Enabled,
      );
      if (!params) {
        return null;
      }
      const result = await predictCodes({
        evaluationId,
        text,
        system: params.systems,
        client,
        scope: JSON.stringify([environment, tenantName, clientId]),
      });
      return result;
    },
    [
      authConfig.accessToken,
      tenantName,
      clientId,
      environment,
      rules,
      settings.snomedEnabled,
      settings.icd10Enabled,
    ],
  );

  const agentEvaluate = useCallback(
    async (req: AgentNudgeRequest): Promise<AgentNudgeResponse> => {
      const client = clientRef.current;
      if (!client) {
        throw new Error("Agent client not ready — authentication pending.");
      }
      return evaluateCodesWithAgent(client, req, settings.agentCached);
    },
    [settings.agentCached],
  );

  const promptEvaluate = useCallback(
    async (req: PromptEvalRequest): Promise<PromptEvalResponse> => {
      const client = clientRef.current;
      if (!client) {
        throw new Error("Agent client not ready — authentication pending.");
      }
      return evaluatePromptWithAgent(client, req, settings.agentCached);
    },
    [settings.agentCached],
  );

  const agentPromptState = useNudgeAgentPrompt();
  const nudgeOptions: UseNudgesOptions = useMemo(
    () => ({
      promptRevision: agentPromptState.revision,
      codeSystems: [
        ...(settings.snomedEnabled ? ["snomed" as const] : []),
        ...(settings.icd10Enabled ? ["icd10" as const] : []),
      ],
      evaluationScope: connectionScope,
      codeEnabled: settings.snomedEnabled || settings.icd10Enabled,
      onPredict:
        settings.snomedEnabled || settings.icd10Enabled
          ? codePredict
          : undefined,
      agentEnabled: settings.agentEnabled,
      onAgentEvaluate: settings.agentEnabled ? agentEvaluate : undefined,
      agentCached: settings.agentCached,
      promptEnabled: true,
      onPromptEvaluate: promptEvaluate,
    }),
    [
      agentPromptState.revision,
      environment,
      tenantName,
      clientId,
      connectionScope,
      settings.snomedEnabled,
      settings.icd10Enabled,
      codePredict,
      settings.agentEnabled,
      agentEvaluate,
      settings.agentCached,
      promptEvaluate,
    ],
  );

  const {
    activeNudges,
    resolvedNudges,
    isPredicting,
    predictError,
    isEvaluating,
    agentError,
    isPromptEvaluating,
    dismissNudge,
    clearResolved,
    onCadenceEvent,
  } = useNudges(editorRef, rules, nudgeOptions);

  const debugLog = useNudgeDebugLog();

  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showRuleEditor, setShowRuleEditor] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  useEffect(() => {
    nudgeRuleStore.setIdentity(clientId, tenantName);
    setCommandIdentity(clientId, tenantName);
    replacementStore.setIdentity(clientId, tenantName);
    termStore.setIdentity(clientId, tenantName);
  }, [clientId, tenantName]);

  // Wire auth + identity into the SNOMED agent module (prompt persistence, agent ID cache).
  const lastConfigSig = useRef("");
  useEffect(() => {
    if (hasAccessToken && authConfig && sdkEnvironment) {
      configureNudgeAgent(
        authConfig,
        sdkEnvironment,
        clientId,
        tenantName,
        environment,
      );
      const sig = JSON.stringify([clientId, tenantName, environment, rules]);
      if (sig !== lastConfigSig.current) {
        lastConfigSig.current = sig;
        logSessionConfig(rules);
      }
    } else {
      lastConfigSig.current = "";
      resetNudgeAgentSession();
      invalidateCache();
    }
  }, [
    hasAccessToken,
    authConfig,
    sdkEnvironment,
    clientId,
    tenantName,
    environment,
    rules,
  ]);

  // Seed sample text on first mount.
  useEffect(() => {
    if (editorRef.current && !editorRef.current.textContent) {
      editorRef.current.textContent = SAMPLE_NOTE;
    }
  }, []);

  const [tokenSeen, setTokenSeen] = useState(false);
  useEffect(() => {
    if (isReady) {
      setTokenSeen(true);
    }
  }, [isReady]);

  const dictationConfig = useMemo(
    () =>
      buildSuiteConfig(language, {
        replacements,
        terms,
        commands: toTranscribeCommands(commands),
        formatting: settings.formatting,
      }),
    [language, replacements, terms, commands, settings.formatting],
  );

  // Command registry for dispatching voice commands
  const registry = useMemo(() => buildRegistry(commands), [commands]);
  const registryRef = useRef(registry);
  registryRef.current = registry;

  /** Committed dictation ranges, for "delete that" / "capitalize that". */
  const historyRef = useRef<Range[]>([]);

  const runCommandData = useCallback(
    (data: Corti.TranscribeCommandData) => {
      const a = adapterRef.current;
      if (!a) {
        return;
      }
      const outcome = dispatchCommand(a, data, registryRef.current, {
        history: historyRef.current,
        templates: TEMPLATES,
        primaryLanguage: language,
      });
      if (outcome.history) {
        historyRef.current = outcome.history;
      }
      logCommand({
        id: data.id,
        variables: data.variables,
        description: outcome.description,
      });
      // Re-evaluate nudges after command action modifies text.
      onCadenceEvent({ type: "edit" });
    },
    [language, onCadenceEvent],
  );

  const handleCommand = useCallback(
    (e: CustomEvent) => {
      const data = e.detail?.data;
      if (!data) {
        return;
      }
      runCommandData(data);
    },
    [runCommandData],
  );

  const handleHidCommand = useCallback(
    (commandId: string) =>
      runCommandData({
        id: commandId,
        variables: {},
      } as Corti.TranscribeCommandData),
    [runCommandData],
  );
  useHidCommandHandler(handleHidCommand);
  useHidCommandCatalog(
    "real-time-nudge",
    useMemo(() => commands.map((c) => ({ id: c.id, label: c.id })), [commands]),
  );

  const handleTranscript = useCallback(
    (e: CustomEvent) => {
      setError(null);
      const data = e.detail?.data;
      if (!data || Array.isArray(data)) {
        return;
      }
      if (!data.isFinal) {
        setInterim(data.text);
        return;
      }
      setInterim("");
      const inserted = adapterRef.current?.insert(data.text, {
        primaryLanguage: language,
      });
      if (inserted) {
        historyRef.current = [...historyRef.current, inserted].slice(-50);
      }
      // Trigger cadence evaluation after dictation insertion.
      onCadenceEvent({ type: "edit" });
    },
    [language, onCadenceEvent],
  );

  // Rule editor callbacks
  const upsertRule = useCallback((item: NudgeRule) => {
    nudgeRuleStore.upsert(item);
  }, []);

  const removeRules = useCallback((ids: string[]) => {
    nudgeRuleStore.removeMany(ids);
  }, []);

  const newRuleId = useCallback(() => nudgeRuleStore.newId(), []);

  const ruleById = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Real-time documentation nudges
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Type or dictate a clinical note. The nudge engine responds to your
          documentation cadence and surfaces subtle "chirps" when a
          documentation gap is detected. Configure text matching or SNOMED
          reasoning rules to customize the feedback. No hard-stop alerts, just
          gentle real-time support.
        </p>
      </div>

      {/* Dictation controls */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rules.length} rules · {activeNudges.length} active nudges
          {isPredicting && (
            <span className="ml-2 inline-flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Predicting codes…
            </span>
          )}
          {(isEvaluating || isPromptEvaluating) && (
            <span className="ml-2 inline-flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking agent…
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {tokenSeen ? (
            <CortiDictationComponent
              authConfig={authConfig}
              dictationConfig={dictationConfig}
              settingsEnabled={["device", "language", "keybinding"]}
              onTranscript={handleTranscript}
              onCommand={handleCommand}
              onLanguagesChanged={onLanguagesChanged}
              onError={(e: CustomEvent) =>
                setError(e.detail?.message ?? "Unknown error")
              }
            />
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Waiting for authentication…
            </span>
          )}
          <NudgeConfig
            settings={settings}
            onSettingsChange={setSettings}
            predictError={predictError}
            agentError={agentError}
          />
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <span>
            <span className="font-semibold">Recording error: </span>
            {error}
          </span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-xs hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main layout: editor + nudge panel */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Editor column */}
        <div ref={editorColumnRef} className="flex min-w-0 flex-col gap-2">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            data-testid="nudge-editor"
            className={cn(
              "min-h-[420px] w-full rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-foreground outline-none focus:border-corti-lime",
              "[&:empty]:before:text-muted-foreground [&:empty]:before:content-['Start_typing_or_dictating…']",
            )}
          />
          {interim && (
            <p className="text-sm italic text-muted-foreground">{interim}</p>
          )}

          {/* Command monitor: detected commands + executed action */}
          {log.length > 0 && (
            <div className="rounded-md border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Command monitor
                </p>
                <button
                  type="button"
                  onClick={clearLog}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="h-3 w-3" /> Clear
                </button>
              </div>
              <ul className="max-h-48 divide-y divide-border overflow-auto">
                {log.map((entry) => (
                  <li
                    key={`${entry.at}-${entry.id}`}
                    className="flex items-baseline gap-2 px-3 py-1.5 text-xs"
                  >
                    <code className="shrink-0 font-semibold text-foreground">
                      {entry.id}
                    </code>
                    {entry.variables &&
                      Object.keys(entry.variables).length > 0 && (
                        <code className="shrink-0 text-muted-foreground">
                          {JSON.stringify(entry.variables)}
                        </code>
                      )}
                    <span className="truncate text-foreground">
                      {entry.description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Nudge panel */}
        <div className="flex flex-col gap-3">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Bird className="h-5 w-5" />
          </h3>
          {activeNudges.length === 0 && (
            <p className="text-xs text-muted-foreground">
              &nbsp;&nbsp;&nbsp;&nbsp;no active nudges ✨
            </p>
          )}
          {activeNudges.map((nudge) => {
            const rule = ruleById.get(nudge.ruleId);
            if (!rule) {
              return null;
            }
            const matched = nudge.codeMatch?.parent;
            const isIcd10 = matched?.system.startsWith("icd10") ?? false;
            return (
              <div
                key={nudge.ruleId}
                className="rounded-md border border-corti-lime/40 bg-corti-lime/5 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {rule.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {rule.message || nudge.dynamicMessage}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {matched && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                            aria-label="Code details"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-80">
                          <div className="flex flex-col gap-2">
                            <div>
                              <p className="text-xs font-semibold text-foreground">
                                Predicted code
                              </p>
                              <div className="mt-0.5 flex items-start gap-1.5 text-xs">
                                <a
                                  href={
                                    isIcd10
                                      ? `https://icd10coded.com/cm/${matched.code}`
                                      : `https://lookup.snomedbrowser.org/${matched.code}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline"
                                >
                                  {matched.code}
                                  <ExternalLink className="mt-0.5 h-3 w-3" />
                                </a>
                                <span className="text-muted-foreground">
                                  {matched.display}
                                </span>
                              </div>
                            </div>
                            {matched.evidences?.length && (
                              <div>
                                <p className="text-xs font-semibold text-foreground">
                                  Supporting evidence
                                </p>
                                <div className="mt-0.5 space-y-1">
                                  {matched.evidences.map((ev) => (
                                    <span
                                      key={`${ev.start}-${ev.end}`}
                                      className="block text-xs italic text-muted-foreground"
                                    >
                                      …{ev.text}…
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {matched.alternatives?.length &&
                              matched.alternatives.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-foreground">
                                    Alternative codes
                                  </p>
                                  <div className="mt-0.5 max-h-40 overflow-auto space-y-0.5 text-xs text-muted-foreground">
                                    {matched.alternatives.map((alt) => (
                                      <div
                                        key={alt.code}
                                        className="flex items-start gap-1"
                                      >
                                        <a
                                          href={
                                            isIcd10
                                              ? `https://icd10coded.com/cm/${alt.code}`
                                              : `https://lookup.snomedbrowser.org/${alt.code}`
                                          }
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline"
                                        >
                                          {alt.code}
                                          <ExternalLink className="mt-0.5 h-3 w-3" />
                                        </a>
                                        <span>{alt.display}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                    <button
                      type="button"
                      onClick={() => dismissNudge(nudge.ruleId)}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label="Dismiss nudge"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {resolvedNudges.length > 0 && (
            <>
              <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Resolved
              </h3>
              {resolvedNudges.map((nudge) => {
                const rule = ruleById.get(nudge.ruleId);
                if (!rule) {
                  return null;
                }
                return (
                  <div
                    key={nudge.ruleId}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
                    <span className="flex-1 text-xs text-muted-foreground line-through">
                      {rule.title}
                    </span>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={clearResolved}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear resolved
              </button>
            </>
          )}
        </div>
      </div>

      {/* Rule editor */}
      <div className="rounded-md border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Nudge rules</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowRuleEditor(!showRuleEditor)}
          >
            {showRuleEditor ? "Hide rules" : "Show rules"}
          </Button>
        </div>
        {showRuleEditor && (
          <div className="mt-3">
            <p className="mb-3 text-xs text-muted-foreground">
              Each rule has trigger criteria (when to fire) and resolve criteria
              (when to auto-resolve). Text conditions support grammar syntax:{" "}
              <code>[word]</code> optional, <code>(a|b|c)</code> alternation,{" "}
              <code>(textMatch.conditions)</code> self-reference,
              space-separated groups are AND-ed. SNOMED conditions use
              agent-assisted evaluation (enable in config → SNOMED → Agent).
            </p>
            <NudgeRuleEditor
              items={rules}
              onUpsert={upsertRule}
              onRemoveMany={removeRules}
              newId={newRuleId}
            />
          </div>
        )}
      </div>

      {/* Agent system prompt editor */}
      <div className="rounded-md border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Agent system prompt
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowPromptEditor(!showPromptEditor)}
          >
            {showPromptEditor ? "Hide prompt" : "Show prompt"}
          </Button>
        </div>
        {showPromptEditor && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                System prompt
              </p>
              <span className="text-[10px] text-muted-foreground">
                {agentPromptState.status === "preparing"
                  ? "Updating agent…"
                  : agentPromptState.error
                    ? agentPromptState.error
                    : agentPromptState.status === "ready"
                      ? "Applied"
                      : ""}
              </span>
            </div>
            <AgentPromptTextarea
              prompt={agentPromptState.prompt}
              defaultPrompt={DEFAULT_SYSTEM_PROMPT}
              status={agentPromptState.status}
              onSave={(p) => void saveAgentPrompt(p)}
              onReset={() => void resetAgentPrompt()}
            />
          </div>
        )}
      </div>

      {/* Debug log */}
      <div className="rounded-md border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Debug log</h3>
          <div className="flex items-center gap-3">
            {debugLog.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(debugLog, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `nudge-debug-${new Date().toISOString().slice(0, 19)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Download className="h-3 w-3" /> Export JSON
              </button>
            )}
            <button
              type="button"
              onClick={clearDebugLog}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="h-3 w-3" /> Clear
            </button>
          </div>
        </div>
        <div className="mt-3 max-h-64 overflow-auto space-y-1">
          {debugLog.length === 0 ? (
            <p className="text-xs text-muted-foreground">No entries yet.</p>
          ) : (
            debugLog.map((entry) => (
              <DebugLogRow key={entry.id} entry={entry} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

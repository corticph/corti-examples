/**
 * Applet: Command Genie — describe a command or nudge in plain language and an
 * agent builds it for you.
 *
 * Two modes share one dictation surface:
 * - Command mode: enter trigger phrases + action description → agent generates a
 *   ManagedCommand → saved to commandStore → immediately testable by dictating.
 * - Nudge mode: enter trigger description + nudge message → agent generates a
 *   NudgeRule → saved to nudgeRuleStore → immediately testable via the nudge
 *   evaluation pipeline (text matching, SNOMED/ICD-10 code prediction, prompt).
 */

import type { Corti } from "@corti/sdk";
import { CortiClient } from "@corti/sdk";
import {
  ArrowDown,
  Bird,
  Check,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { dispatchCommand } from "../_shared/commandDispatch";
import { CortiDictationComponent } from "../_shared/cortiDictationReact";
import type { EditorAdapter } from "../_shared/editorAdapter";
import { EXAMPLES_ANALYTICS } from "../_shared/examplesAnalytics";
import type { Range } from "../_shared/offsetMap";
import { useSessionState } from "../_shared/sessionState";
import { useActiveControl } from "../_shared/useActiveControl";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useHidCommandCatalog, useHidCommandHandler } from "../_shared/useDictationDevice";
import { useDictationLanguage } from "../_shared/useDictationLanguage";
import { cn } from "../_shared/utils";
import { CommandManager } from "../dictation-commands/CommandManager";
import { buildRegistry, TEMPLATES, toTranscribeCommands } from "../dictation-commands/commandModel";
import {
  type CommandLogEntry,
  clearLog,
  logCommand,
  setIdentity as setCommandIdentity,
  upsertCommand,
  useCommandStore,
} from "../dictation-commands/commandStore";
import { buildSuiteConfig } from "../dictation-suite/suiteConfig";
import { termStore } from "../dictionary-terms/terms";
import { nudgeConnectionState } from "../real-time-nudge/connectionState";
import { loadSettings, NudgeConfig, type NudgeSettings } from "../real-time-nudge/NudgeConfig";
import { NudgeRuleEditor } from "../real-time-nudge/NudgeRuleEditor";
import { nudgeRuleStore } from "../real-time-nudge/nudgeRules";
import { invalidateCache, predictCodes } from "../real-time-nudge/predictCodes";
import {
  type AgentNudgeRequest,
  type AgentNudgeResponse,
  clearDebugLog,
  configureNudgeAgent,
  evaluateCodesWithAgent,
  evaluatePromptWithAgent,
  invalidateAgentCache,
  invalidatePromptAgentCache,
  type NudgeDebugEntry,
  type PromptEvalRequest,
  type PromptEvalResponse,
  resetNudgeAgentSession,
  useNudgeAgentPrompt,
  useNudgeDebugLog,
} from "../real-time-nudge/snomedAgent";
import { type UseNudgesOptions, useNudges } from "../real-time-nudge/useNudges";
import { replacementStore } from "../text-replacements/replacements";
import { ensureGenieAgent, grantWish } from "./genieAgent";
import { buildGenieMessage, type GenieMode, summarizeCommand, summarizeNudge } from "./genieModel";

/* ------------------------------------------------------------------ */
/* Genie history entry                                                 */
/* ------------------------------------------------------------------ */

interface GenieHistoryEntry {
  mode: GenieMode;
  title: string;
  summary: string;
  at: number;
  request: string;
  response: string;
}

/* ------------------------------------------------------------------ */
/* Auto-scroll hook                                                    */
/* ------------------------------------------------------------------ */

function useAutoScroll(ref: React.RefObject<HTMLElement | null>, length: number, enabled: boolean) {
  const autoScrollRef = useRef(enabled);
  autoScrollRef.current = enabled;

  useEffect(() => {
    if (!ref.current || !autoScrollRef.current) {
      return;
    }
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [length, ref]);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    autoScrollRef.current = atBottom;
  }, [ref]);

  return onScroll;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function CommandGenie() {
  const { authConfig, clientId, environment, sdkEnvironment, tenantName, isReady } =
    useCortiAccessToken();

  const { available: hasAccessToken, scope: connectionScope } = nudgeConnectionState({
    authConfig,
    environment,
    tenantName,
    clientId,
    isReady,
  });
  const { language, onLanguagesChanged } = useDictationLanguage();

  const [mode, setMode] = useState<GenieMode>("command");
  const [input1, setInput1] = useState("");
  const [input2, setInput2] = useState("");
  const [wishing, setWishing] = useState(false);
  const [wishResult, setWishResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [history, setHistory] = useSessionState<GenieHistoryEntry[]>("genie-history", []);
  const [showHistory, setShowHistory] = useState(false);
  const [showRuleEditor, setShowRuleEditor] = useState(false);
  const [showCommandManager, setShowCommandManager] = useState(false);

  /* Auto-scroll for monitors */
  const commandLogRef = useRef<HTMLDivElement>(null);
  const nudgeLogRef = useRef<HTMLDivElement>(null);
  const [commandAutoScroll, setCommandAutoScroll] = useState(true);
  const [nudgeAutoScroll, setNudgeAutoScroll] = useState(true);

  /* Editor + dictation surface */
  const editorColumnRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const { adapter } = useActiveControl(editorColumnRef);
  const adapterRef = useRef<EditorAdapter | null>(null);
  adapterRef.current = adapter;

  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tokenSeen, setTokenSeen] = useState(false);

  /* Shared stores */
  const { commands, log } = useCommandStore();
  const replacements = replacementStore.useItems();
  const terms = termStore.useItems();
  const rules = nudgeRuleStore.useItems();

  /* Nudge settings (only used in nudge mode) */
  const [settings, setSettings] = useState<NudgeSettings>(loadSettings);

  /* Set identity on auth change */
  useEffect(() => {
    setCommandIdentity(clientId, tenantName);
    nudgeRuleStore.setIdentity(clientId, tenantName);
    replacementStore.setIdentity(clientId, tenantName);
    termStore.setIdentity(clientId, tenantName);
  }, [clientId, tenantName]);

  /* CortiClient for agent calls — created lazily in handleGrantWish and
     in the nudge-mode effect. Never created on mount to avoid the SDK's
     constructor calling refreshAccessToken immediately, which causes an
     auth loop before the user interacts. */
  const clientRef = useRef<CortiClient | null>(null);

  /* Latch token seen so the dictation component doesn't unmount on refresh */
  useEffect(() => {
    if (isReady) {
      setTokenSeen(true);
    }
  }, [isReady]);

  /* Nudge agent configuration — always active (both modes show the nudge
     panel). configureNudgeAgent creates its own internal managementClient, so
     this does not create a CortiClient loop. */
  useEffect(() => {
    invalidateCache();
  }, [settings.snomedEnabled, settings.icd10Enabled]);

  useEffect(() => {
    invalidateAgentCache();
    invalidatePromptAgentCache();
  }, [settings.agentEnabled, settings.agentCached]);

  const agentPromptState = useNudgeAgentPrompt();

  useEffect(() => {
    if (hasAccessToken && authConfig && sdkEnvironment) {
      configureNudgeAgent(authConfig, sdkEnvironment, clientId, tenantName, environment);
    } else {
      resetNudgeAgentSession();
      invalidateCache();
    }
  }, [hasAccessToken, authConfig, sdkEnvironment, clientId, tenantName, environment]);

  /* CortiClient for nudge pipeline calls (predict, agent). Created the same
     way as Real-time nudge — re-created when auth changes, but the SDK handles
     token refresh internally so this doesn't loop. The genie agent client is
     created lazily in handleGrantWish. */
  useEffect(() => {
    if (hasAccessToken && authConfig && sdkEnvironment) {
      clientRef.current = new CortiClient({
        environment: sdkEnvironment,
        auth: authConfig,
        analytics: EXAMPLES_ANALYTICS,
      });
    } else {
      clientRef.current = null;
    }
  }, [hasAccessToken, authConfig, sdkEnvironment]);

  const codePredict = useCallback(
    async (text: string, evaluationId?: string): Promise<Corti.CodesGeneralResponse | null> => {
      if (!authConfig.accessToken || !text.trim()) {
        return null;
      }
      const client = clientRef.current;
      if (!client) {
        return null;
      }

      const hasSnomedRules = rules.some((r) => r.enabled && (r.trigger.snomed || r.resolve.snomed));
      const hasIcd10Rules = rules.some((r) => r.enabled && (r.trigger.icd10 || r.resolve.icd10));
      const wantSnomed = settings.snomedEnabled && hasSnomedRules;
      const wantIcd10 = settings.icd10Enabled && hasIcd10Rules;
      if (!wantSnomed && !wantIcd10) {
        return null;
      }

      const systems: string[] = [];
      if (wantSnomed) {
        systems.push("snomedctint");
      }
      if (wantIcd10) {
        systems.push("icd10cm-outpatient");
      }
      if (systems.length === 0) {
        return null;
      }

      return predictCodes({
        evaluationId,
        text,
        system: systems,
        client,
        scope: JSON.stringify([environment, tenantName, clientId]),
      });
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

  const nudgeOptions: UseNudgesOptions = useMemo(
    () => ({
      promptRevision: agentPromptState.revision,
      codeSystems: [
        ...(settings.snomedEnabled ? ["snomed" as const] : []),
        ...(settings.icd10Enabled ? ["icd10" as const] : []),
      ],
      evaluationScope: connectionScope,
      codeEnabled: settings.snomedEnabled || settings.icd10Enabled,
      onPredict: settings.snomedEnabled || settings.icd10Enabled ? codePredict : undefined,
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
  const onCommandScroll = useAutoScroll(commandLogRef, log.length, commandAutoScroll);
  const onNudgeScroll = useAutoScroll(nudgeLogRef, debugLog.length, nudgeAutoScroll);

  /* Dictation config */
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

  /* Command registry for dispatching voice commands */
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
    "command-genie",
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
      onCadenceEvent({ type: "edit" });
    },
    [language, onCadenceEvent],
  );

  /* Seed editor on first mount */
  useEffect(() => {
    if (editorRef.current && !editorRef.current.textContent) {
      editorRef.current.textContent = "";
    }
  }, []);

  /* Grant wish handler — creates the CortiClient lazily here so no server
     calls happen until the user clicks this button. */
  const handleGrantWish = useCallback(async () => {
    if (!input1.trim() || !input2.trim()) {
      return;
    }
    if (!hasAccessToken || !authConfig || !sdkEnvironment) {
      setWishResult({
        type: "error",
        message: "Authentication not ready. Please wait for the token to resolve.",
      });
      return;
    }

    setWishing(true);
    setWishResult(null);

    try {
      /* Create the client lazily if we don't have one (command mode —
         nudge mode creates it in its own effect). */
      let client = clientRef.current;
      if (!client) {
        client = new CortiClient({
          environment: sdkEnvironment,
          auth: authConfig,
          analytics: EXAMPLES_ANALYTICS,
        });
        clientRef.current = client;
      }

      const agentId = await ensureGenieAgent(client);

      const requestJson = buildGenieMessage(mode, input1.trim(), input2.trim());
      const result = await grantWish(client, agentId, {
        mode,
        input1: input1.trim(),
        input2: input2.trim(),
      });

      if (!result.ok) {
        const errResult = result as { ok: false; error: string };
        setWishResult({ type: "error", message: errResult.error });
        setHistory((prev) => [
          {
            mode,
            title: "error",
            summary: errResult.error,
            at: Date.now(),
            request: requestJson,
            response: errResult.error,
          },
          ...prev,
        ]);
        return;
      }

      const okResult = result as { ok: true; mode: string } & (
        | {
            mode: "command";
            command: import("../dictation-commands/commandModel").ManagedCommand;
          }
        | {
            mode: "nudge";
            rule: import("../real-time-nudge/nudgeRules").NudgeRule;
          }
      );

      const responseJson = JSON.stringify(okResult, null, 2);

      if (okResult.mode === "command") {
        upsertCommand(okResult.command);
        const summary = summarizeCommand(okResult.command);
        setWishResult({
          type: "success",
          message: `Your wish is my command! ${summary}`,
        });
        setHistory((prev) => [
          {
            mode: "command",
            title: okResult.command.id,
            summary,
            at: Date.now(),
            request: requestJson,
            response: responseJson,
          },
          ...prev,
        ]);
      } else {
        nudgeRuleStore.upsert(okResult.rule);
        const summary = summarizeNudge(okResult.rule);
        setWishResult({
          type: "success",
          message: `Your wish is my command! ${summary}`,
        });
        setHistory((prev) => [
          {
            mode: "nudge",
            title: okResult.rule.title,
            summary,
            at: Date.now(),
            request: requestJson,
            response: responseJson,
          },
          ...prev,
        ]);
      }

      setInput1("");
      setInput2("");
    } catch (e) {
      setWishResult({
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setWishing(false);
    }
  }, [mode, input1, input2, hasAccessToken, authConfig, sdkEnvironment, setHistory]);

  const ruleById = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);

  const input1Label =
    mode === "command"
      ? "When I say… (comma-separated phrases)"
      : "When the note contains… (trigger description)";
  const input2Label =
    mode === "command" ? "It should… (describe the action)" : "Nudge message… (what to remind)";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Wand2 className="h-5 w-5" />
          Command Genie
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe a voice command or a nudge rule in plain language. An agent builds the
          configuration for you — test it immediately in the live dictation surface below.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={mode === "command" ? "default" : "outline"}
          onClick={() => setMode("command")}
        >
          <Wand2 className="mr-1.5 h-4 w-4" />
          Command Genie
        </Button>
        <Button
          size="sm"
          variant={mode === "nudge" ? "default" : "outline"}
          onClick={() => setMode("nudge")}
        >
          <Bird className="mr-1.5 h-4 w-4" />
          Nudge Genie
        </Button>
      </div>

      {/* Genie inputs */}
      <div className="flex flex-col gap-3 rounded-md border border-border p-4">
        <label
          htmlFor="genie-input-1"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {input1Label}
        </label>
        <input
          id="genie-input-1"
          type="text"
          value={input1}
          onChange={(e) => setInput1(e.target.value)}
          placeholder={
            mode === "command" ? "insert plan, new plan" : "heart failure without type or acuity"
          }
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-corti-lime"
        />
        <label
          htmlFor="genie-input-2"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {input2Label}
        </label>
        <textarea
          id="genie-input-2"
          value={input2}
          onChange={(e) => setInput2(e.target.value)}
          placeholder={
            mode === "command"
              ? "insert a new paragraph with the text 'Plan:'"
              : "remind me to specify CHF type and acuity"
          }
          rows={2}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-corti-lime"
        />
        <div className="flex items-center gap-3">
          <Button onClick={handleGrantWish} disabled={wishing || !input1.trim() || !input2.trim()}>
            {wishing ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Granting…
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-4 w-4" />
                Grant my wish
              </>
            )}
          </Button>
          {wishResult && (
            <p
              className={cn(
                "flex-1 text-sm",
                wishResult.type === "success"
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              {wishResult.message}
            </p>
          )}
        </div>
      </div>

      {/* Dictation controls */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {commands.length} commands · {rules.length} rules · {activeNudges.length} active nudges
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
              onError={(e: CustomEvent) => setError(e.detail?.message ?? "Unknown error")}
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

      {/* Main layout: editor + nudge panel (always shown) */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Editor column */}
        <div ref={editorColumnRef} className="flex min-w-0 flex-col gap-2">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            data-testid="genie-editor"
            className={cn(
              "min-h-[320px] w-full rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-foreground outline-none focus:border-corti-lime",
              "[&:empty]:before:text-muted-foreground [&:empty]:before:content-['Start_typing_or_dictating…']",
            )}
          />
          {interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}
        </div>

        {/* Nudge panel */}
        <div className="flex flex-col gap-3">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Bird className="h-5 w-5" />
          </h3>
          {activeNudges.length === 0 && (
            <p className="text-xs text-muted-foreground">
              &nbsp;&nbsp;&nbsp;&nbsp;no active nudges
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
                    <p className="text-sm font-semibold text-foreground">{rule.title}</p>
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
                                </a>
                                <span className="text-muted-foreground">{matched.display}</span>
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

      {/* Monitors: command + nudge side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Command monitor */}
        <div className="rounded-md border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Command monitor
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCommandAutoScroll(!commandAutoScroll)}
                className={cn(
                  "rounded p-0.5 text-muted-foreground hover:text-foreground",
                  commandAutoScroll && "text-corti-lime",
                )}
                aria-label="Toggle auto-scroll"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              {log.length > 0 && (
                <button
                  type="button"
                  onClick={clearLog}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          {log.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No commands detected yet.</p>
          ) : (
            <div ref={commandLogRef} className="max-h-64 overflow-auto" onScroll={onCommandScroll}>
              <ul className="space-y-0.5">
                {[...log].reverse().map((entry) => (
                  <CommandLogRow key={`${entry.at}-${entry.id}`} entry={entry} />
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Nudge monitor */}
        <div className="rounded-md border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Nudge monitor
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNudgeAutoScroll(!nudgeAutoScroll)}
                className={cn(
                  "rounded p-0.5 text-muted-foreground hover:text-foreground",
                  nudgeAutoScroll && "text-corti-lime",
                )}
                aria-label="Toggle auto-scroll"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              {debugLog.length > 0 && (
                <button
                  type="button"
                  onClick={clearDebugLog}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          {debugLog.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No entries yet.</p>
          ) : (
            <div
              ref={nudgeLogRef}
              className="max-h-64 overflow-auto space-y-1"
              onScroll={onNudgeScroll}
            >
              {debugLog.map((entry) => (
                <NudgeDebugRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Command manager */}
      <div className="rounded-md border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Commands</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCommandManager(!showCommandManager)}
          >
            {showCommandManager ? "Hide commands" : "Show commands"}
          </Button>
        </div>
        {showCommandManager && (
          <div className="mt-3">
            <CommandManager stacked />
          </div>
        )}
      </div>

      {/* Nudge rule editor */}
      <div className="rounded-md border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Nudge rules</h3>
          <Button size="sm" variant="outline" onClick={() => setShowRuleEditor(!showRuleEditor)}>
            {showRuleEditor ? "Hide rules" : "Show rules"}
          </Button>
        </div>
        {showRuleEditor && (
          <div className="mt-3">
            <p className="mb-3 text-xs text-muted-foreground">
              Each rule has trigger criteria (when to fire) and resolve criteria (when to
              auto-resolve). Text conditions support grammar syntax: <code>[word]</code> optional,{" "}
              <code>(a|b|c)</code> alternation, <code>(textMatch.conditions)</code> self-reference,
              space-separated groups are AND-ed. SNOMED conditions use agent-assisted evaluation
              (enable in config → SNOMED → Agent).
            </p>
            <NudgeRuleEditor
              items={rules}
              onUpsert={nudgeRuleStore.upsert}
              onRemoveMany={nudgeRuleStore.removeMany}
              newId={nudgeRuleStore.newId}
            />
          </div>
        )}
      </div>

      {/* Genie history (collapsible) */}
      <div className="rounded-md border border-border p-4">
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          className="flex w-full items-center justify-between"
        >
          <h3 className="text-sm font-semibold text-foreground">
            Genie history ({history.length})
          </h3>
          {showHistory ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {showHistory && history.length > 0 && (
          <ul className="mt-3 divide-y divide-border">
            {history.map((entry) => (
              <GenieHistoryRow key={`${entry.at}-${entry.title}`} entry={entry} />
            ))}
          </ul>
        )}
        {showHistory && history.length === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">No wishes granted yet.</p>
        )}
      </div>
    </div>
  );
}

function CommandLogRow({ entry }: { entry: CommandLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = entry.variables && Object.keys(entry.variables).length > 0;

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
          <code className="shrink-0 font-semibold text-foreground">{entry.id}</code>
          <span className="truncate text-foreground">{entry.description}</span>
        </button>
      ) : (
        <div className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 font-mono text-muted-foreground">
            {formatDebugTime(entry.at)}
          </span>
          <code className="shrink-0 font-semibold text-foreground">{entry.id}</code>
          <span className="truncate text-foreground">{entry.description}</span>
        </div>
      )}
      {expanded && hasDetail && entry.variables && (
        <div className="ml-10 mt-1.5">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Variables
          </p>
          <pre className="max-h-48 overflow-auto rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">
            {JSON.stringify(entry.variables, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function formatDebugTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:${pad(d.getMilliseconds(), 3)}`;
}

function NudgeDebugRow({ entry }: { entry: NudgeDebugEntry }) {
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
              entry.type === "predict-request" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
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
              entry.type === "predict-request" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
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
          {entry.data !== undefined ? JSON.stringify(entry.data, null, 2) : entry.text}
        </pre>
      )}
    </div>
  );
}

function GenieHistoryRow({ entry }: { entry: GenieHistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="py-1.5 text-xs">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-muted-foreground">
          {formatDebugTime(entry.at)}
        </span>
        <span
          className={cn(
            "shrink-0 rounded px-1 text-[10px] font-semibold",
            entry.mode === "command"
              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
              : "bg-green-500/10 text-green-600 dark:text-green-400",
          )}
        >
          {entry.mode}
        </span>
        <code className="shrink-0 font-semibold text-foreground">{entry.title}</code>
        <span className="flex-1 truncate text-muted-foreground">{entry.summary}</span>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 space-y-2">
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Request
            </p>
            <pre className="max-h-40 overflow-auto rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">
              {entry.request}
            </pre>
          </div>
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Response
            </p>
            <pre className="max-h-40 overflow-auto rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">
              {entry.response}
            </pre>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * useNudges — the React hook that ties the nudge engine to the editor.
 *
 * Responsibilities:
 * 1. Watch the contentEditable for cadence events (via the cadence detector).
 * 2. Debounce cadence events so a rapid burst of typing waits for the
 *    burst to settle before evaluating.
 * 3. After debounce, read the editor text and run `evaluateRules`.
 * 4. Diff the evaluation result against the current nudge state to
 *    produce transitions: new nudges (active), resolved nudges (resolved),
 *    dismissed nudges that stay dismissed.
 * 5. Expose `dismissNudge` and `clearDismissed` for the UI.
 *
 * Accepts an optional `onPredict` callback that is called after debounce
 * to fetch medical codes for the current text. The predict result is
 * passed to the engine for code-based rule evaluation.
 *
 * Nudge state is in-memory (useSessionState) — it should survive navigating
 * between applets but not a page reload, matching the session-scoped
 * persistence boundary.
 */

import type { Corti } from "@corti/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionState } from "../_shared/sessionState";
import { attachCadenceDetector, type CadenceEvent } from "./cadenceDetector";
import { type CodeSystem, codeCriteria, criterionId } from "./evaluation";
import { type CodeMatch, type EvaluateOptions, evaluateRules } from "./nudgeEngine";
import type { NudgeRule } from "./nudgeRules";
import { SupersededRequest } from "./requestStage";
import {
  type AgentNudgeRequest,
  type AgentNudgeResponse,
  type PromptEvalRequest,
  type PromptEvalResponse,
  pushDebugEntry,
} from "./snomedAgent";

export type NudgeStatus = "active" | "resolved" | "dismissed";

export interface NudgeState {
  ruleId: string;
  freshness?: "pending" | "stale";
  status: NudgeStatus;
  firedAt: number;
  resolvedAt?: number;
  dismissedAt?: number;
  /** Matched predicted code info when the rule triggered via code criteria. */
  codeMatch?: CodeMatch;
  /** Agent-generated display message for prompt-based rules. */
  dynamicMessage?: string;
}

const DEBOUNCE_MS = 3000;
let evaluationSequence = 0;

export interface UseNudgesOptions {
  /** Stable connection identity; excludes rotating access tokens. */
  evaluationScope?: string;
  codeSystems?: CodeSystem[];
  promptRevision?: number;
  /** Async callback to predict medical codes for the current text. */
  onPredict?: (text: string, evaluationId?: string) => Promise<Corti.CodesGeneralResponse | null>;
  /** Whether code prediction (SNOMED and/or ICD-10) is enabled. */
  codeEnabled?: boolean;
  /** Async callback to evaluate code rules via a Corti agent. */
  onAgentEvaluate?: (req: AgentNudgeRequest) => Promise<AgentNudgeResponse>;
  /** Whether agent-assisted code evaluation is enabled. */
  agentEnabled?: boolean;
  /** Whether to cache agent results (for testing, can be disabled). */
  agentCached?: boolean;
  /** Async callback to evaluate custom prompt criteria via a Corti agent. */
  onPromptEvaluate?: (req: PromptEvalRequest) => Promise<PromptEvalResponse>;
  /** Whether prompt-based evaluation is enabled. */
  promptEnabled?: boolean;
}

export function useNudges(
  editorRef: React.RefObject<HTMLElement | null>,
  rules: NudgeRule[],
  options?: UseNudgesOptions,
): {
  nudges: NudgeState[];
  unknownCount: number;
  activeNudges: NudgeState[];
  resolvedNudges: NudgeState[];
  dismissNudge: (ruleId: string) => void;
  clearResolved: () => void;
  /** Whether a SNOMED predict call is in-flight. */
  isPredicting: boolean;
  /** Error from the last SNOMED predict call. */
  predictError: string | null;
  /** Whether an agent evaluation call is in-flight. */
  isEvaluating: boolean;
  /** Error from the last agent evaluation call. */
  agentError: string | null;
  /** Whether a prompt evaluation call is in-flight. */
  isPromptEvaluating: boolean;
  /** Error from the last prompt evaluation call. */
  promptError: string | null;
  /** Called externally when a final dictation transcript is inserted. */
  onCadenceEvent: (event: CadenceEvent) => void;
} {
  const [nudges, setNudges] = useSessionState<NudgeState[]>(
    `nudges:${options?.evaluationScope ?? "default"}`,
    [],
  );
  const [unknownCount, setUnknownCount] = useState(0);
  // Track actual pending work independently of whether its result is still current.
  const [predictingCount, setPredictingCount] = useState(0);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [evaluatingCount, setEvaluatingCount] = useState(0);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [promptEvaluatingCount, setPromptEvaluatingCount] = useState(0);
  const [promptError, setPromptError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evaluationVersion = useRef(0);
  const lastUnknownCountRef = useRef(0);
  const pipelineInFlightRef = useRef(false);
  const pendingTextRef = useRef<string | null>(null);
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const nudgesRef = useRef(nudges);
  nudgesRef.current = nudges;
  // Callback/object identities can change during token refresh. Only semantic
  // configuration changes invalidate an evaluation already in progress.
  const configKey = JSON.stringify([
    rules,
    options?.evaluationScope,
    options?.codeEnabled,
    options?.agentEnabled,
    options?.promptEnabled,
    options?.agentCached,
    options?.codeSystems,
    options?.promptRevision,
  ]);
  const configKeyRef = useRef(configKey);
  configKeyRef.current = configKey;

  const evaluate = useCallback(
    (evaluateOptions: EvaluateOptions = {}, freshness: "pending" | "stale" = "pending") => {
      const el = editorRef.current;
      if (!el) {
        return;
      }
      const text = el.textContent ?? "";
      if (!text.trim()) {
        setNudges([]);
        setUnknownCount(0);
        return;
      }
      const result = evaluateRules(text, rulesRef.current, evaluateOptions);
      setUnknownCount(result.unknown.size);
      lastUnknownCountRef.current = result.unknown.size;
      setNudges((prev) => {
        const next: NudgeState[] = [];
        for (const rule of rulesRef.current) {
          if (!rule.enabled) {
            continue;
          }
          const existing = prev.find((n) => n.ruleId === rule.id);
          if (result.unknown.has(rule.id)) {
            if (existing) {
              next.push({ ...existing, freshness });
            }
          } else if (existing?.status === "dismissed") {
            next.push({ ...existing, freshness: undefined });
          } else if (result.resolved.has(rule.id)) {
            if (existing) {
              next.push({
                ...existing,
                status: "resolved",
                freshness: undefined,
                resolvedAt: existing.resolvedAt ?? Date.now(),
              });
            }
          } else if (result.triggered.has(rule.id)) {
            next.push({
              ruleId: rule.id,
              status: "active",
              firedAt: existing?.firedAt ?? Date.now(),
              codeMatch: result.codeMatches.get(rule.id),
              dynamicMessage: result.messages.get(rule.id),
            });
          }
        }
        return next;
      });
      pushDebugEntry(
        "nudge-update",
        `${result.triggered.size} triggered, ${result.resolved.size} resolved, ${result.unknown.size} unknown`,
      );
    },
    [editorRef, setNudges],
  );

  const onCadenceEvent = useCallback(
    (_event: CadenceEvent) => {
      const version = ++evaluationVersion.current;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(async () => {
        const opts = optionsRef.current;
        const el = editorRef.current;
        if (!el) {
          return;
        }
        const text = el.textContent ?? "";
        if (!text.trim()) {
          evaluate();
          return;
        }
        if (pipelineInFlightRef.current) {
          pendingTextRef.current = text;
          pushDebugEntry(
            "evaluation-suppressed",
            `Pipeline in flight; text queued (${text.length} chars)`,
          );
          return;
        }
        const snapshotConfig = configKeyRef.current;
        let discardLogged = false;
        const isCurrent = () => {
          const reason =
            evaluationVersion.current !== version
              ? "newer editor event or unmount"
              : editorRef.current?.textContent !== text
                ? "note text changed"
                : configKeyRef.current !== snapshotConfig
                  ? "rules or evaluation configuration changed"
                  : null;
          if (reason && !discardLogged) {
            discardLogged = true;
            pushDebugEntry("evaluation-discarded", `Evaluation ${version}: ${reason}`);
          }
          return reason === null;
        };

        const evaluationId = `evaluation-${++evaluationSequence}`;
        pushDebugEntry("request-state", `${evaluationId}: started`, { evaluationId });
        const results: EvaluateOptions = {};
        setPredictError(null);
        setAgentError(null);
        setPromptError(null);
        // Evaluate text rules immediately so they show without waiting
        // for the async agent round-trips.
        evaluate();

        pipelineInFlightRef.current = true;

        // Collect async evaluation tasks to run in parallel.
        const tasks: Promise<void>[] = [];

        // SNOMED path: predict → code agent (handles both SNOMED and ICD-10)
        if (opts?.codeEnabled && opts.onPredict) {
          tasks.push(
            (async () => {
              try {
                setPredictingCount((count) => count + 1);
                let predictResult: Corti.CodesGeneralResponse | null | undefined;
                try {
                  predictResult = await opts.onPredict?.(text, evaluationId);
                } finally {
                  setPredictingCount((count) => count - 1);
                }
                if (!isCurrent()) {
                  return;
                }
                setPredictError(null);
                results.predictResult = predictResult;

                if (opts.agentEnabled && opts.onAgentEvaluate && predictResult) {
                  const codeRules = rulesRef.current
                    .filter(
                      (r) =>
                        r.enabled &&
                        (r.trigger.snomed ||
                          r.trigger.icd10 ||
                          r.resolve.snomed ||
                          r.resolve.icd10),
                    )
                    .map((rule) => ({
                      ...rule,
                      trigger: {
                        ...rule.trigger,
                        snomed:
                          opts.codeSystems && !opts.codeSystems.includes("snomed")
                            ? undefined
                            : rule.trigger.snomed,
                        icd10:
                          opts.codeSystems && !opts.codeSystems.includes("icd10")
                            ? undefined
                            : rule.trigger.icd10,
                      },
                      resolve: {
                        ...rule.resolve,
                        snomed:
                          opts.codeSystems && !opts.codeSystems.includes("snomed")
                            ? undefined
                            : rule.resolve.snomed,
                        icd10:
                          opts.codeSystems && !opts.codeSystems.includes("icd10")
                            ? undefined
                            : rule.resolve.icd10,
                      },
                    }));
                  if (codeRules.length > 0) {
                    const currentNudges = nudgesRef.current;
                    const nudgeState = {
                      triggered: currentNudges
                        .filter((n) => n.status === "active")
                        .map((n) => n.ruleId),
                      resolved: currentNudges
                        .filter((n) => n.status === "resolved")
                        .map((n) => n.ruleId),
                      dismissed: currentNudges
                        .filter((n) => n.status === "dismissed")
                        .map((n) => n.ruleId),
                    };
                    setEvaluatingCount((count) => count + 1);
                    try {
                      const agentResult = await opts.onAgentEvaluate?.({
                        evaluationId,
                        text,
                        codes: predictResult,
                        criteria: codeCriteria(codeRules),
                        nudgeState,
                      });
                      if (!isCurrent()) {
                        return;
                      }
                      setAgentError(null);
                      results.agentResult = agentResult;
                      evaluate(results);
                    } catch (err) {
                      if (!isCurrent() || err instanceof SupersededRequest) {
                        return;
                      }
                      setAgentError(err instanceof Error ? err.message : "Agent evaluation failed");
                      evaluate(results);
                    } finally {
                      setEvaluatingCount((count) => count - 1);
                    }
                  } else {
                    evaluate(results);
                  }
                } else {
                  evaluate(results);
                }
              } catch (err) {
                if (!isCurrent()) {
                  return;
                }
                if (err instanceof SupersededRequest) {
                  return;
                }
                setPredictError(err instanceof Error ? err.message : "SNOMED predict failed");
              }
            })(),
          );
        }

        // Prompt path: prompt evaluator agent (no predict needed)
        if (opts?.promptEnabled && opts.onPromptEvaluate) {
          tasks.push(
            (async () => {
              const promptRules = rulesRef.current.filter(
                (r) => r.enabled && (r.trigger.prompt || r.resolve.prompt),
              );
              if (promptRules.length === 0) {
                return;
              }
              const criteria: { id: string; prompt: string }[] = [];
              for (const r of promptRules) {
                if (r.trigger.prompt) {
                  criteria.push({
                    id: criterionId(r.id, "trigger", "prompt"),
                    prompt: r.trigger.prompt.prompt,
                  });
                }
                if (r.resolve.prompt) {
                  criteria.push({
                    id: criterionId(r.id, "resolve", "prompt"),
                    prompt: r.resolve.prompt.prompt,
                  });
                }
              }
              if (criteria.length === 0) {
                return;
              }
              setPromptEvaluatingCount((count) => count + 1);
              try {
                const promptResult = await opts.onPromptEvaluate?.({
                  evaluationId,
                  text,
                  criteria,
                });
                if (!isCurrent()) {
                  return;
                }
                setPromptError(null);
                results.promptResult = promptResult;
                evaluate(results);
              } catch (err) {
                if (!isCurrent()) {
                  return;
                }
                if (err instanceof SupersededRequest) {
                  return;
                }
                setPromptError(err instanceof Error ? err.message : "Prompt evaluation failed");
                pushDebugEntry(
                  "prompt-response",
                  `Prompt evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
                );
                evaluate(results);
              } finally {
                setPromptEvaluatingCount((count) => count - 1);
              }
            })(),
          );
        }

        try {
          await Promise.all(tasks);
          if (isCurrent() && lastUnknownCountRef.current > 0) {
            evaluate(results, "stale");
          }
        } finally {
          pipelineInFlightRef.current = false;
          if (pendingTextRef.current !== null) {
            const pending = pendingTextRef.current;
            pendingTextRef.current = null;
            pushDebugEntry(
              "evaluation-retrigger",
              `Pipeline complete; re-triggering with pending text (${pending.length} chars)`,
            );
            onCadenceEvent({ type: "edit" });
          }
        }
      }, DEBOUNCE_MS);
    },
    [evaluate, editorRef],
  );

  useEffect(() => {
    const el = editorRef.current;
    if (!el) {
      return;
    }

    const detector = attachCadenceDetector(el, onCadenceEvent);
    return () => {
      evaluationVersion.current++;
      detector.detach();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [editorRef, onCadenceEvent]);

  const previousScope = useRef(options?.evaluationScope);
  useEffect(() => {
    if (previousScope.current !== optionsRef.current?.evaluationScope) {
      previousScope.current = optionsRef.current?.evaluationScope;
      setNudges([]);
    }
    evaluate();
    onCadenceEvent({ type: "edit" });
  }, [configKey, evaluate, onCadenceEvent, setNudges]);

  const dismissNudge = useCallback(
    (ruleId: string) => {
      setNudges((prev) =>
        prev.map((n) =>
          n.ruleId === ruleId && n.status === "active"
            ? { ...n, status: "dismissed" as const, dismissedAt: Date.now() }
            : n,
        ),
      );
      pushDebugEntry("nudge-update", `Dismissed: ${ruleId}`);
    },
    [setNudges],
  );

  const clearResolved = useCallback(() => {
    setNudges((prev) => prev.filter((n) => n.status !== "resolved"));
    pushDebugEntry("nudge-update", "Cleared resolved nudges");
  }, [setNudges]);

  return {
    nudges,
    unknownCount,
    activeNudges: nudges.filter((n) => n.status === "active"),
    resolvedNudges: nudges.filter((n) => n.status === "resolved"),
    isPredicting: predictingCount > 0,
    predictError,
    isEvaluating: evaluatingCount > 0,
    agentError,
    isPromptEvaluating: promptEvaluatingCount > 0,
    promptError,
    dismissNudge,
    clearResolved,
    onCadenceEvent,
  };
}

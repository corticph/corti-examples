/** Unfiltered prediction: every referenced absence condition must have coverage. */
import type { Corti, CortiClient } from "@corti/sdk";
import { RequestStage } from "./requestStage";
import { pushDebugEntry, stageReporter } from "./snomedAgent";
/** Filter condition for the predict API `filter.include`/`filter.exclude` field. */
export interface PredictFilterCondition {
  property: string;
  op: Corti.CodesFilterConditionOp;
  value: string | string[];
}

/** Filter passed to the predict API to scope prediction to relevant codes. */
export interface PredictFilter {
  include?: PredictFilterCondition[];
  exclude?: PredictFilterCondition[];
}

export interface PredictRequest {
  text: string;
  evaluationId?: string;
  /** Environment/tenant/authenticated client identity, without rotating tokens. */
  scope?: string;
  /** Coding system(s) to predict. If omitted, uses DEFAULT_SYSTEM. */
  system?: string | string[];
  client: CortiClient;
  /** Optional transport filter; the applet intentionally requests unfiltered coverage. */
  filter?: PredictFilter;
}

const stage = new RequestStage<Corti.CodesGeneralResponse>(
  stageReporter("predict"),
);
let currentScope = "";
let controller: AbortController | undefined;
let activeKey: string | undefined;
let sequence = 0;
export function invalidateCache() {
  stage.invalidate();
  controller?.abort();
}
export async function predictCodes(
  req: PredictRequest,
): Promise<Corti.CodesGeneralResponse> {
  const scope = req.scope ?? "default";
  if (scope !== currentScope) {
    invalidateCache();
    currentScope = scope;
  }
  if (!req.text.trim()) {
    controller?.abort();
    return { codes: [], candidates: [], usageInfo: { creditsConsumed: 0 } };
  }
  const body: Corti.CodesGeneralPredictRequest = {
    system: (Array.isArray(req.system)
      ? req.system
      : [req.system ?? "snomedctint"]) as Corti.CommonCodingSystemEnum[],
    context: [{ type: "text", text: req.text }],
    ...(req.filter ? { filter: req.filter } : {}),
  };
  const key = JSON.stringify([scope, body]);
  if (controller && activeKey !== key) {
    controller.abort();
  }
  return stage.run(key, async () => {
    const abort = new AbortController();
    controller = abort;
    activeKey = key;
    const requestId = `predict-${++sequence}`;
    pushDebugEntry("predict-request", "POST /tools/coding/", {
      requestId,
      evaluationId: req.evaluationId,
      ...body,
    });
    try {
      const result = await req.client.codes.predict(body, {
        abortSignal: abort.signal,
      });
      pushDebugEntry(
        "predict-response",
        `${result.codes.length} codes, ${result.candidates.length} candidates`,
        { requestId, evaluationId: req.evaluationId, ...result },
      );
      return result;
    } finally {
      if (controller === abort) {
        controller = undefined;
        activeKey = undefined;
      }
    }
  });
}

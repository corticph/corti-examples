import { CortiClient } from "@corti/sdk";
import { AlertCircle, ChevronDown, ChevronRight, LayoutGrid, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deduplicateTemplates,
  describeDocumentsError,
  OUTPUT_LANGUAGES,
  useGuidedTemplates,
} from "../_shared/corti-documents";
import { EXAMPLES_ANALYTICS } from "../_shared/examplesAnalytics";
import { useSessionState } from "../_shared/sessionState";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { runTemplateShowdown, type TemplateResult, useTemplateShowdownStore } from "./api";

function TemplateCard({ result }: { result: TemplateResult }) {
  const [open, setOpen] = useSessionState("cardOpen", true);

  const statusColor =
    result.status === "done"
      ? "border-border"
      : result.status === "error"
        ? "border-destructive/40"
        : "border-border opacity-60";

  return (
    <div className={`rounded-lg border bg-card ${statusColor}`}>
      <button
        type="button"
        className="flex w-full items-center gap-2 p-3 text-left"
        onClick={() => setOpen((o) => !o)}
        disabled={result.status === "pending"}
      >
        {result.status === "pending" ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : result.status === "error" ? (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{result.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{result.id}</p>
        </div>

        {result.status === "done" && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {result.sections.length} section
            {result.sections.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {open && result.status === "done" && result.sections.length > 0 && (
        <div className="border-t border-border px-3 pb-3 pt-2">
          <div className="flex flex-col gap-3">
            {result.sections.map(([name, text]) => (
              <div key={name}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {name}
                </p>
                <p className="whitespace-pre-wrap text-sm text-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.status === "error" && (
        <div className="border-t border-destructive/30 px-3 pb-3 pt-2">
          <p className="text-xs text-destructive">{result.error}</p>
        </div>
      )}
    </div>
  );
}

export function TemplateShowdown() {
  const { authConfig, sdkEnvironment } = useCortiAccessToken();
  const { status, results, doneCount, totalCount, error } = useTemplateShowdownStore();
  const [input, setInput] = useSessionState("input", "");
  const [language, setLanguage] = useSessionState("language", "en");
  const busy = status === "running";

  const { templates, loading: templatesLoading } = useGuidedTemplates(
    authConfig,
    sdkEnvironment,
    language,
  );
  const uniqueTemplates = useMemo(() => deduplicateTemplates(templates), [templates]);

  const client = useMemo(() => {
    if (!authConfig.accessToken) {
      return null;
    }
    return new CortiClient({
      environment: sdkEnvironment,
      auth: authConfig,
      analytics: EXAMPLES_ANALYTICS,
    });
  }, [sdkEnvironment, authConfig]);

  const handleRun = () => {
    if (!client || uniqueTemplates.length === 0) {
      return;
    }
    void runTemplateShowdown(client, uniqueTemplates, input, language);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Template showdown</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Fire one clinical note through every template on your tenant simultaneously. See how each
          template interprets the same input, useful for discovering what templates produce and
          picking the right one for a workflow.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Output language</Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OUTPUT_LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Clinical input
        </p>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={7}
          readOnly={busy}
          placeholder="Paste a transcript, dictation, or clinical note here…"
          className="mt-1 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={handleRun}
          disabled={busy || !input.trim() || !client || templatesLoading}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutGrid className="h-4 w-4" />}
          Run all templates
        </Button>
        {busy && (
          <span className="text-xs text-muted-foreground">
            {totalCount > 0 ? `${doneCount} / ${totalCount} complete…` : "Fetching templates…"}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{describeDocumentsError(error)}</p>}

      {results.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Results · {results.length} template{results.length !== 1 ? "s" : ""}
          </p>
          {results.map((r) => (
            <TemplateCard key={r.id} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

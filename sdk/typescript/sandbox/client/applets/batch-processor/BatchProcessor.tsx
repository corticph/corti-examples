import { CortiClient } from "@corti/sdk";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ListChecks,
  Loader2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  findDefaultTemplate,
  OUTPUT_LANGUAGES,
  useGuidedTemplates,
} from "../_shared/corti-documents";
import { useSessionState } from "../_shared/sessionState";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { type BatchJob, runBatch, splitNotes, useBatchProcessorStore } from "./api";

const PLACEHOLDER = `Patient is a 67-year-old male presenting with chest pain…

---

45-year-old female with a history of type 2 diabetes…

---

Patient seen for follow-up of hypertension and dyslipidemia…`;

function JobRow({ job }: { job: BatchJob }) {
  const [open, setOpen] = useSessionState("jobOpen", false);

  const icon =
    job.status === "done" ? (
      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500 dark:text-green-400" />
    ) : job.status === "error" ? (
      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
    ) : job.status === "running" ? (
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
    ) : (
      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
    );

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        className="flex w-full items-center gap-2 p-3 text-left"
        onClick={() => job.status === "done" && setOpen((o) => !o)}
        disabled={job.status !== "done"}
      >
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground font-medium">Note {job.index + 1}</p>
          <p className="truncate text-sm text-foreground">{job.preview}</p>
        </div>
        {job.status === "done" && (
          <>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {job.sections.length} section
              {job.sections.length !== 1 ? "s" : ""}
            </span>
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </>
        )}
      </button>

      {open && job.status === "done" && (
        <div className="border-t border-border px-3 pb-3 pt-2">
          <div className="flex flex-col gap-3">
            {job.sections.map(([name, text]) => (
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

      {job.status === "error" && (
        <div className="border-t border-destructive/30 px-3 pb-2 pt-1">
          <p className="text-xs text-destructive">{job.error}</p>
        </div>
      )}
    </div>
  );
}

export function BatchProcessor() {
  const { authConfig, sdkEnvironment } = useCortiAccessToken();
  const { status, jobs, doneCount, error } = useBatchProcessorStore();
  const [raw, setRaw] = useSessionState("raw", "");
  const [templateId, setTemplateId] = useSessionState("templateId", "");
  const [manualTemplateId, setManualTemplateId] = useSessionState("manualTemplateId", "");
  const [language, setLanguage] = useSessionState("language", "en");
  const busy = status === "running";

  const { templates, loading: templatesLoading } = useGuidedTemplates(
    authConfig,
    sdkEnvironment,
    language,
  );
  const uniqueTemplates = useMemo(() => deduplicateTemplates(templates), [templates]);

  useEffect(() => {
    if (!templateId && uniqueTemplates.length > 0) {
      const match = findDefaultTemplate(uniqueTemplates, "soap", "brief", "progress");
      if (match) {
        setTemplateId(match.id);
      }
    }
  }, [uniqueTemplates, templateId, setTemplateId]);

  const client = useMemo(() => {
    if (!authConfig.accessToken) {
      return null;
    }
    return new CortiClient({ environment: sdkEnvironment, auth: authConfig });
  }, [sdkEnvironment, authConfig]);

  const effectiveTemplateId = templateId || manualTemplateId.trim();
  const notes = splitNotes(raw);
  const count = notes.length;

  const handleRun = () => {
    if (!client || !effectiveTemplateId) {
      return;
    }
    void runBatch(client, notes, effectiveTemplateId, language);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Batch note processor</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste multiple clinical notes separated by <code className="font-mono text-xs">---</code>{" "}
          lines. All notes are processed in parallel with the same template. Results expand inline
          per note.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Template</Label>
          {uniqueTemplates.length > 0 ? (
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {uniqueTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={manualTemplateId}
              onChange={(e) => setManualTemplateId(e.target.value)}
              placeholder={
                templatesLoading
                  ? "Loading templates…"
                  : "No templates found, paste a template UUID"
              }
            />
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Output language</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger>
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
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Clinical notes
          </p>
          {count > 0 && (
            <p className="text-xs text-muted-foreground">
              {count} note{count !== 1 ? "s" : ""} detected
            </p>
          )}
        </div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={10}
          readOnly={busy}
          placeholder={PLACEHOLDER}
          className="mt-1 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Separate notes with a line containing only <code className="font-mono">---</code>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={handleRun}
          disabled={busy || count === 0 || !client || !effectiveTemplateId}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
          Process {count > 0 ? `${count} note${count !== 1 ? "s" : ""}` : "notes"}
        </Button>
        {busy && (
          <span className="text-xs text-muted-foreground">
            {doneCount} / {jobs.length} complete…
          </span>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {jobs.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Results
          </p>
          {jobs.map((job) => (
            <JobRow key={job.index} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

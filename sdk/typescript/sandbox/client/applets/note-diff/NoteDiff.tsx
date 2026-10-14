import { CortiClient } from "@corti/sdk";
import { Columns2, Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";
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
import { runNoteDiff, useNoteDiffStore } from "./api";

function SectionColumn({
  label,
  sections,
  allKeys,
}: {
  label: string;
  sections: [string, string][];
  allKeys: string[];
}) {
  const byKey = Object.fromEntries(sections);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {allKeys.map((key) => {
        const text = byKey[key];
        return (
          <div key={key}>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{key}</p>
            {text ? (
              <div className="rounded-md border border-border bg-background p-3 text-sm text-foreground whitespace-pre-wrap">
                {text}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground italic">
                Section not present
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function NoteDiff() {
  const { authConfig, sdkEnvironment } = useCortiAccessToken();
  const { status, sectionsA, sectionsB, error } = useNoteDiffStore();
  const [textA, setTextA] = useSessionState("textA", "");
  const [textB, setTextB] = useSessionState("textB", "");
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
  const allKeys = Array.from(new Set([...sectionsA.map(([k]) => k), ...sectionsB.map(([k]) => k)]));

  const handleRun = () => {
    if (!client || !effectiveTemplateId) {
      return;
    }
    void runNoteDiff(client, textA, textB, effectiveTemplateId, language);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Two-note comparison</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate the same document template for two different notes and view the sections
          side-by-side. Useful for comparing visits, drafts, or how phrasing affects the output.
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

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Note A
          </p>
          <textarea
            value={textA}
            onChange={(e) => setTextA(e.target.value)}
            rows={7}
            readOnly={busy}
            placeholder="Paste the first clinical note here…"
            className="mt-1 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Note B
          </p>
          <textarea
            value={textB}
            onChange={(e) => setTextB(e.target.value)}
            rows={7}
            readOnly={busy}
            placeholder="Paste the second clinical note here…"
            className="mt-1 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={handleRun}
          disabled={busy || !textA.trim() || !textB.trim() || !client || !effectiveTemplateId}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Columns2 className="h-4 w-4" />}
          Compare notes
        </Button>
        {busy && <span className="text-xs text-muted-foreground">Generating both…</span>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {allKeys.length > 0 && (
        <div className="flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Section comparison
          </p>
          <div className="flex gap-4">
            <SectionColumn label="Note A output" sections={sectionsA} allKeys={allKeys} />
            <div className="hidden w-px bg-border lg:block" />
            <SectionColumn label="Note B output" sections={sectionsB} allKeys={allKeys} />
          </div>
        </div>
      )}
    </div>
  );
}

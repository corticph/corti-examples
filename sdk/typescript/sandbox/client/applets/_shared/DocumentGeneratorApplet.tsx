/**
 * Generic single-note document generator shared by the soap-note-generator,
 * discharge-summary, referral-letter, and procedure-note applets — same
 * shape (pick a template, pick a language, paste a note, generate), only the
 * copy and default template differ. Each applet folder supplies a
 * `DocGenConfig` and renders this component.
 */

import type { Corti } from "@corti/sdk";
import { CortiClient } from "@corti/sdk";
import { FileText, Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import {
  deduplicateTemplates,
  describeDocumentsError,
  documentSections,
  findDefaultTemplate,
  generateFromText,
  OUTPUT_LANGUAGES,
  useGuidedTemplates,
} from "./corti-documents";
import { useCortiAccessToken } from "./useCortiAccessToken";

export interface DocGenConfig {
  heading: string;
  description: ReactNode;
  /** Substrings matched against template names to pick a sensible default. */
  templateKeywords: string[];
  inputLabel: string;
  sampleText: string;
  generateLabel: string;
}

export function DocumentGeneratorApplet({ config }: { config: DocGenConfig }) {
  const { authConfig, sdkEnvironment } = useCortiAccessToken();
  const [templateId, setTemplateId] = useState("");
  const [manualTemplateId, setManualTemplateId] = useState("");
  const [language, setLanguage] = useState("en");
  const { templates, loading: templatesLoading } = useGuidedTemplates(
    authConfig,
    sdkEnvironment,
    language,
  );
  const uniqueTemplates = deduplicateTemplates(templates);
  const [note, setNote] = useState(config.sampleText);
  const [document, setDocument] =
    useState<Corti.GuidedEphemeralDocument | null>(null);
  const [usage, setUsage] = useState<Corti.CommonUsageInfo | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId && uniqueTemplates.length > 0) {
      const match = findDefaultTemplate(
        uniqueTemplates,
        ...config.templateKeywords,
      );
      if (match) {
        setTemplateId(match.id);
      }
    }
  }, [uniqueTemplates, templateId, config.templateKeywords]);

  const effectiveTemplateId = templateId || manualTemplateId.trim();

  const generate = async () => {
    if (!note.trim() || !effectiveTemplateId) {
      return;
    }
    setGenerating(true);
    setError(null);
    setDocument(null);
    setUsage(null);
    try {
      const client = new CortiClient({
        environment: sdkEnvironment,
        auth: authConfig,
      });
      const response = await generateFromText(
        client,
        effectiveTemplateId,
        note,
        language,
      );
      setDocument(response.document);
      setUsage(response.usageInfo);
    } catch (e) {
      setError(describeDocumentsError(e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {config.heading}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {config.description}
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

      <div className="space-y-1.5">
        <Label className="text-xs">{config.inputLabel}</Label>
        <Textarea
          rows={10}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="font-mono text-sm"
        />
      </div>

      <div>
        <Button
          onClick={generate}
          disabled={generating || !note.trim() || !effectiveTemplateId}
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          {config.generateLabel}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-variant-error-foreground">{error}</p>
      )}

      {document && (
        <div className="space-y-3">
          {documentSections(document).map(([name, text]) => (
            <div key={name} className="rounded-md border border-border p-3">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {name}
              </h3>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {text}
              </p>
            </div>
          ))}
          {usage && (
            <p className="text-xs text-muted-foreground">
              Credits consumed: {usage.creditsConsumed}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

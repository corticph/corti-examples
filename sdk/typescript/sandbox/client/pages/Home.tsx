import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Boxes,
  ChartNoAxesColumnIncreasing,
  Check,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  FileText,
  Key,
  Loader2,
  Mic,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { lazy, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  APPLETS,
  type AppletDefinition,
  appletPath,
  getApplet,
  getAppletByPath,
  getAppletsForWorkflow,
  WORKFLOW_TABS,
  type WorkflowArea,
} from "../applets/registry";
import { getAppletSources } from "../applets/sources";
import { type AppletWriteup, getAppletWriteup, isStepGuide } from "../applets/writeups";
import { CodeBlock, languageFor, type SourceFile } from "../components/docs/CodeBlock";
import { WriteupSection } from "../components/docs/WriteupSection";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { cn } from "../lib/utils";

// three + R3F is heavy and only used on this Home page, so load it as its own chunk.
const _CardHeaderGL = lazy(() =>
  import("../components/docs/CardHeaderGL").then((m) => ({
    default: m.CardHeaderGL,
  })),
);

import { AppletIdProvider } from "../applets/_shared/sessionState";
import { useAuth } from "../context/AuthContext";
import { CLUSTERS } from "../types/websocket";
import NotFound from "./NotFound";

const HERO_CARDS: Array<{
  area: WorkflowArea;
  icon: typeof Mic;
  title: string;
  desc: string;
}> = [
  {
    area: "dictation",
    icon: Mic,
    title: "Speech to Text",
    desc: "Dictation, conversational transcripts, voice commands, app control, and raw SDK microphone examples.",
  },
  {
    area: "text-generation",
    icon: FileText,
    title: "Text Generation",
    desc: "Structured document generation from notes and transcripts: SOAP notes, discharge summaries, referral letters, and template comparisons.",
  },
  {
    area: "medical-coding",
    icon: Stethoscope,
    title: "Medical Coding",
    desc: "Predicting, validating, and cross-walking medical codes from clinical notes, with evidence and multi-encounter tracking.",
  },
  {
    area: "agentic",
    icon: Sparkles,
    title: "Agentic",
    desc: "Agent-assisted speech tooling that post-processes or steers SDK-driven transcription output, plus multi-agent pipelines for chart prep, prior auth, and QA review.",
  },
  {
    area: "extended",
    icon: Boxes,
    title: "Extended Workflows",
    desc: "Facts extraction, human-in-the-loop approval, and role- or capability-scoped multi-agent networks.",
  },
];

const SANDBOX_STATS = [
  { label: "Applets", value: APPLETS.length },
  {
    label: "Shared applet components",
    value: Object.keys(import.meta.glob("../applets/_shared/**/*.tsx")).length,
  },
  { label: "Workflow areas", value: WORKFLOW_TABS.filter(({ id }) => id !== "home").length },
  {
    label: "UI primitives",
    value: Object.keys(import.meta.glob("../components/ui/**/*.tsx")).length,
  },
];

const LINKS = [
  { href: "https://docs.corti.ai", label: "Corti docs" },
  { href: "https://docs.corti.ai/api-reference", label: "API reference" },
  { href: "https://www.npmjs.com/package/@corti/sdk", label: "@corti/sdk" },
  {
    href: "https://www.npmjs.com/package/@corti/dictation-web",
    label: "@corti/dictation-web",
  },
  {
    href: "https://www.npmjs.com/package/@corti/ambient-web",
    label: "@corti/ambient-web",
  },
  {
    href: "https://github.com/corticph/corti-examples",
    label: "corti-examples",
  },
  {
    href: "https://github.com/corticph/corti-examples/tree/main/sdk/typescript/sandbox",
    label: "Sandbox source",
  },
];

const AREA_LABEL: Record<WorkflowArea, string> = {
  dictation: WORKFLOW_TABS.find((t) => t.id === "dictation")?.label ?? "Speech to Text",
  agentic: WORKFLOW_TABS.find((t) => t.id === "agentic")?.label ?? "Agentic",
  "text-generation":
    WORKFLOW_TABS.find((t) => t.id === "text-generation")?.label ?? "Text generation",
  "medical-coding": WORKFLOW_TABS.find((t) => t.id === "medical-coding")?.label ?? "Medical coding",
  extended: WORKFLOW_TABS.find((t) => t.id === "extended")?.label ?? "Extended workflows",
};

function AuthStatusBadge() {
  const { isReady, isLoading, authStatus, authConfig } = useAuth();

  if (isLoading || authStatus.step === "authenticating") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-variant-warning-border bg-variant-warning-bg px-2.5 py-0.5 text-xs font-semibold text-variant-warning-text">
        <Loader2 className="h-3 w-3 animate-spin" />
        Authenticating…
      </span>
    );
  }
  if (authStatus.step === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-variant-error-border bg-variant-error-bg px-2.5 py-0.5 text-xs font-semibold text-variant-error-text">
        <AlertCircle className="h-3 w-3" />
        Auth error
      </span>
    );
  }
  if (isReady && authConfig.authToken) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-variant-success-border bg-variant-success-bg px-2.5 py-0.5 text-xs font-semibold text-variant-success-text dark:border-corti-lime/50 dark:bg-corti-lime/10 dark:text-corti-lime">
        <CheckCircle2 className="h-3 w-3" />
        Authenticated
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
      Not authenticated
    </span>
  );
}

/** Assemble a single LLM-ready markdown blob: narrative + snippets + full source. */
function buildLlmBundle(
  applet: AppletDefinition,
  writeup: AppletWriteup | undefined,
  sources: SourceFile[],
): string {
  const out: string[] = [];
  out.push(`# ${applet.title} (${AREA_LABEL[applet.workflow]})`, "");
  out.push(applet.description);

  if (writeup) {
    out.push("", "## The problem");
    writeup.premise.forEach((p) => {
      out.push("", p);
    });
    out.push("", "## Step-by-step build guide");
    if (isStepGuide(writeup.how)) {
      writeup.how.forEach((step) => {
        out.push("", `### ${step.heading}`);
        step.text.forEach((p) => {
          out.push("", p);
        });
        step.snippets?.forEach((s) => {
          out.push("");
          if (s.caption) {
            out.push(`**${s.caption}**`);
          }
          out.push(`\`\`\`${s.lang ?? "tsx"}`, s.code, "```");
        });
      });
    } else {
      writeup.how.forEach((p) => {
        out.push("", p);
      });
    }
    if (writeup.snippets?.length) {
      out.push("", "## Key snippets");
      writeup.snippets.forEach((s) => {
        out.push("");
        if (s.caption) {
          out.push(`### ${s.caption}`);
        }
        out.push(`\`\`\`${s.lang ?? "tsx"}`, s.code, "```");
      });
    }
    if (writeup.considerations?.length) {
      out.push("", "## Considerations");
      writeup.considerations.forEach((c) => {
        out.push("", `- ${c}`);
      });
    }
  }

  if (sources.length) {
    out.push("", "## Full source");
    sources.forEach((f) => {
      out.push("", `### ${f.name}`, `\`\`\`${languageFor(f.name)}`, f.code, "```");
    });
  }

  return out.join("\n");
}

function CopyForLlmButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied writeup and code for your LLM");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy for LLM"}
    </button>
  );
}

/** The docs page for a single applet: writeup + real source + live demo. */
function DocsArticle({ applet }: { applet: AppletDefinition }) {
  const { authConfig } = useAuth();
  const authed = !!authConfig.authToken;
  const sources = getAppletSources(applet.id);
  const writeup = getAppletWriteup(applet.id);
  const Details = applet.Details;
  const Demo = applet.Component;
  const detailsBelowDemo = !!applet.detailsBelowDemo;

  const detailsSection = Details && (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {applet.detailsTitle ?? "Reference"}
      </h2>
      <div className="rounded border border-border bg-card p-5">
        <Details />
      </div>
    </section>
  );

  return (
    <AppletIdProvider appletId={applet.id}>
      <article className={cn("mx-auto space-y-10 py-8", applet.wide ? "max-w-6xl" : "max-w-3xl")}>
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {AREA_LABEL[applet.workflow]}
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{applet.title}</h1>
            <p className="text-base leading-relaxed text-muted-foreground">{applet.description}</p>
          </div>
          <CopyForLlmButton text={buildLlmBundle(applet, writeup, sources)} />
        </header>

        {writeup && <WriteupSection writeup={writeup} />}

        {!detailsBelowDemo && detailsSection}

        {sources.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Source
            </h2>
            <CodeBlock files={sources} />
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Live demo
          </h2>
          {authed ? (
            <div className="rounded border border-border bg-card p-5">
              <Demo key={applet.id} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 rounded border border-border bg-card py-14 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
              <p className="max-w-lg text-sm text-muted-foreground">
                Authenticate with Corti to run this example live. The writeup and source above are
                available without signing in.
              </p>
              <Button asChild>
                <Link to="/">Go to homepage to authenticate</Link>
              </Button>
            </div>
          )}
        </section>

        {detailsBelowDemo && detailsSection}
      </article>
    </AppletIdProvider>
  );
}

export function Home() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const oldAppletId = params.get("applet");
  const redirectDef = oldAppletId ? getApplet(oldAppletId) : undefined;

  useEffect(() => {
    if (redirectDef) {
      navigate(appletPath(redirectDef), { replace: true });
    }
  }, [redirectDef, navigate]);

  const {
    authConfig,
    updateAuthConfig,
    authenticate,
    isLoading,
    isReady,
    authStatus,
    canAuthenticate,
    isUsingEnvVars,
  } = useAuth();
  const [showDetails, setShowDetails] = useState(!isUsingEnvVars);
  const isCustomCluster = !CLUSTERS.some((c) => c.value === authConfig.cluster);

  if (redirectDef) {
    return null;
  }

  return (
    <div className="space-y-6 py-8">
      <div className="space-y-2 pb-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Corti SDK Sandbox</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Browse self-contained use case examples for the Corti SDK and web components. Pick an
          example from the sidebar to read the writeup, view its real source, and run it live.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <section
          aria-labelledby="sandbox-summary-title"
          className="flex flex-col overflow-hidden rounded-none border border-border bg-card"
        >
          <div className="h-28 w-full border-b border-border bg-muted/30" />
          <div className="flex flex-1 flex-col gap-4 p-5">
            <div className="flex items-center gap-2">
              <ChartNoAxesColumnIncreasing className="h-4 w-4 text-foreground" aria-hidden="true" />
              <h2 id="sandbox-summary-title" className="text-lg font-bold text-foreground">
                Sandbox at a glance
              </h2>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
              {SANDBOX_STATS.map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-1">
                  <dt className="text-xs leading-relaxed text-muted-foreground">{label}</dt>
                  <dd className="order-first text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
        {HERO_CARDS.map(({ area, icon: Icon, title, desc }) => {
          const first = getAppletsForWorkflow(area)[0];
          return (
            <Link
              key={area}
              to={first ? appletPath(first) : "/"}
              className="group flex flex-col overflow-hidden rounded-none border border-border bg-card no-underline transition-colors hover:border-foreground"
            >
              {/* Three.js CardHeaderGL disabled for now; slot left blank. */}
              <div className="h-28 w-full border-b border-border bg-muted/30" />
              <div className="flex flex-1 flex-col gap-2 p-5">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-foreground" />
                  <span className="text-lg font-bold text-foreground">{title}</span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
                <span className="mt-auto flex items-center gap-1 pt-2 text-sm font-semibold text-foreground">
                  Open
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Authentication</CardTitle>
              <AuthStatusBadge />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md bg-muted p-2.5">
              <div className="flex items-center gap-2">
                {isUsingEnvVars ? (
                  <CheckCircle2 className="h-4 w-4 text-variant-success-text" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-black dark:text-corti-lime" />
                )}
                <span className="text-sm font-medium">
                  Credential config: {isUsingEnvVars ? "Env file" : "Manual"}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setShowDetails((value) => !value)}
              >
                <Key className="mr-1.5 h-3.5 w-3.5" />
                {showDetails ? "Hide Details" : "Show Details"}
              </Button>
            </div>

            {showDetails && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm">Environment</Label>
                    <Select
                      value={isCustomCluster ? "custom" : authConfig.cluster}
                      onValueChange={(value) => {
                        if (value === "custom") {
                          return;
                        }
                        updateAuthConfig({ cluster: value });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CLUSTERS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    {isCustomCluster && (
                      <Input
                        className="mt-2"
                        value={authConfig.cluster}
                        onChange={(e) => updateAuthConfig({ cluster: e.target.value })}
                        placeholder="dev-weu"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Tenant</Label>
                    <Input
                      value={authConfig.tenant}
                      onChange={(e) => updateAuthConfig({ tenant: e.target.value })}
                      placeholder="base"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Client ID</Label>
                  <Input
                    value={authConfig.clientId}
                    onChange={(e) => updateAuthConfig({ clientId: e.target.value })}
                    placeholder="sdk-sandbox"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Client secret</Label>
                  <Input
                    type="password"
                    value={authConfig.clientSecret}
                    onChange={(e) => updateAuthConfig({ clientSecret: e.target.value })}
                    placeholder="Enter client secret"
                  />
                </div>
              </div>
            )}

            {authStatus.step === "error" && authStatus.error && (
              <div className="rounded-md border border-variant-error-border bg-variant-error-bg px-3 py-2 text-sm text-variant-error-text">
                {authStatus.error}
              </div>
            )}

            <Button
              onClick={() => authenticate().catch(() => {})}
              disabled={isLoading || !canAuthenticate}
              variant={isReady ? "outline" : "default"}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating…
                </>
              ) : isReady ? (
                "Re-authenticate"
              ) : (
                "Authenticate"
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Links</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {LINKS.map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground no-underline hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {label}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function AppletPage() {
  const { workflow, applet } = useParams();
  const def = getAppletByPath(workflow, applet);

  if (!def) {
    return <NotFound />;
  }

  return <DocsArticle applet={def} />;
}

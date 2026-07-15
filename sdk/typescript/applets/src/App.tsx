import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { AppletAuthProvider } from "./applets/_shared/auth-context";
import {
  getAppletsForWorkflow,
  type AppletDefinition,
  type WorkflowArea,
} from "./applets/registry";
import { useCortiAuth } from "./useCortiAuth";
import { cn } from "./lib/utils";

const WORKFLOWS: Array<{ id: WorkflowArea; label: string }> = [
  { id: "dictation", label: "Dictation" },
  { id: "ambient", label: "Ambient" },
  { id: "agentic", label: "Agentic" },
];

export default function App() {
  const { authConfig, authenticate, isReady, isConfigured, error } =
    useCortiAuth();
  const [workflow, setWorkflow] = useState<WorkflowArea>("dictation");
  const [activeAppletId, setActiveAppletId] = useState<string>(
    () => getAppletsForWorkflow("dictation")[0]?.id ?? "",
  );

  const applets = getAppletsForWorkflow(workflow);
  const activeApplet = applets.find((a) => a.id === activeAppletId) ?? applets[0];

  function selectWorkflow(w: WorkflowArea) {
    setWorkflow(w);
    setActiveAppletId(getAppletsForWorkflow(w)[0]?.id ?? "");
  }

  return (
    <AppletAuthProvider value={{ authConfig, authenticate, isReady }}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <Header
          cluster={authConfig.cluster}
          tenant={authConfig.tenant}
          isReady={isReady}
          isConfigured={isConfigured}
          error={error}
          onRetry={authenticate}
        />

        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            workflow={workflow}
            applets={applets}
            activeAppletId={activeApplet?.id}
            onSelectWorkflow={selectWorkflow}
            onSelectApplet={setActiveAppletId}
          />

          <main className="flex-1 overflow-y-auto p-5">
            {!isReady ? (
              <LoadingState isConfigured={isConfigured} error={error} onRetry={authenticate} />
            ) : activeApplet ? (
              <AppletView applet={activeApplet} />
            ) : null}
          </main>
        </div>
      </div>
    </AppletAuthProvider>
  );
}

function Header({
  cluster,
  tenant,
  isReady,
  isConfigured,
  error,
  onRetry,
}: {
  cluster: string;
  tenant: string;
  isReady: boolean;
  isConfigured: boolean;
  error: string | undefined;
  onRetry: () => Promise<string>;
}) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-5 py-3 shrink-0">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-foreground">Corti SDK Applets</span>
        {cluster && (
          <span className="text-xs text-muted-foreground">
            {cluster} · {tenant}
          </span>
        )}
      </div>
      <AuthBadge
        isReady={isReady}
        isConfigured={isConfigured}
        error={error}
        onRetry={onRetry}
      />
    </header>
  );
}

function Sidebar({
  workflow,
  applets,
  activeAppletId,
  onSelectWorkflow,
  onSelectApplet,
}: {
  workflow: WorkflowArea;
  applets: AppletDefinition[];
  activeAppletId: string | undefined;
  onSelectWorkflow: (w: WorkflowArea) => void;
  onSelectApplet: (id: string) => void;
}) {
  return (
    <nav className="flex w-64 shrink-0 flex-col border-r border-border bg-card overflow-y-auto">
      <div className="flex gap-1 border-b border-border p-2">
        {WORKFLOWS.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => onSelectWorkflow(w.id)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
              workflow === w.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {w.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-0.5 p-2">
        {applets.map((applet) => {
          const Icon = applet.icon;
          const selected = activeAppletId === applet.id;
          return (
            <button
              key={applet.id}
              type="button"
              onClick={() => onSelectApplet(applet.id)}
              className={cn(
                "flex items-start gap-2.5 rounded-md px-3 py-2 text-left transition-colors",
                selected
                  ? "bg-accent text-foreground ring-1 ring-inset ring-border"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="block text-sm font-medium">{applet.title}</span>
                <span className="block text-xs text-muted-foreground leading-snug">
                  {applet.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function AppletView({ applet }: { applet: AppletDefinition }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-border bg-card p-5">
        <applet.Component key={applet.id} />
      </section>
      {applet.ExtraSection && (
        <section className="rounded-lg border border-border bg-card p-5">
          <applet.ExtraSection />
        </section>
      )}
      {applet.Details && (
        <section className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {applet.detailsTitle ?? "Details"}
          </h3>
          <applet.Details />
        </section>
      )}
    </div>
  );
}

function LoadingState({
  isConfigured,
  error,
  onRetry,
}: {
  isConfigured: boolean;
  error: string | undefined;
  onRetry: () => Promise<string>;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center max-w-sm">
        {error ? (
          <>
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => onRetry().catch(() => {})}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Retry
            </button>
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {isConfigured ? "Authenticating…" : "Connecting to server…"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function AuthBadge({
  isReady,
  isConfigured,
  error,
  onRetry,
}: {
  isReady: boolean;
  isConfigured: boolean;
  error: string | undefined;
  onRetry: () => Promise<string>;
}) {
  if (error) {
    return (
      <button
        onClick={() => onRetry().catch(() => {})}
        className="inline-flex items-center gap-1.5 rounded-full border border-variant-error-border bg-variant-error-bg px-2.5 py-0.5 text-xs font-semibold text-variant-error-text hover:opacity-80 transition-opacity"
      >
        <AlertCircle className="h-3 w-3" />
        Auth error — retry
      </button>
    );
  }
  if (isReady) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-variant-success-border bg-variant-success-bg px-2.5 py-0.5 text-xs font-semibold text-variant-success-text">
        <CheckCircle2 className="h-3 w-3" />
        Authenticated
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      {isConfigured ? "Authenticating…" : "Connecting…"}
    </span>
  );
}

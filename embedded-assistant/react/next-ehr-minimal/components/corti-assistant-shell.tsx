import type { ReactNode } from "react";

type CortiAssistantShellProps = {
  statusMessage: string;
  statusTone?: "default" | "error";
  height?: number;
  children: ReactNode;
};

export function CortiAssistantShell({
  statusMessage,
  statusTone = "default",
  height = 600,
  children,
}: CortiAssistantShellProps) {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
          Corti assistant
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">
          Live consultation workspace
        </h2>
      </div>

      <div
        className={[
          "rounded-xl border px-4 py-3 text-sm",
          statusTone === "error"
            ? "border-[hsl(var(--variant-error-border))] bg-[hsl(var(--variant-error-bg))] text-[hsl(var(--variant-error-text))]"
            : "border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
        ].join(" ")}
      >
        {statusMessage}
      </div>

      <div
        className="w-full overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-background"
        style={{ height }}
      >
        {children}
      </div>
    </section>
  );
}

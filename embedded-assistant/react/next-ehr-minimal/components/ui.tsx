import Link from "next/link";
import type { ReactNode } from "react";

export function PageShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] min-w-0">
        <aside className="hidden w-72 shrink-0 border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))] px-5 py-6 lg:block">
          {sidebar}
        </aside>
        <main className="min-w-0 flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export function SectionCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface-card min-w-0 ${className}`.trim()}>
      {children}
    </section>
  );
}

export function SidebarLink({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      style={
        active
          ? {
              backgroundColor: "hsl(var(--sidebar-primary))",
              color: "hsl(var(--sidebar-primary-foreground))",
              borderLeftColor: "hsl(var(--corti-lime))",
            }
          : {
              color: "hsl(var(--sidebar-foreground))",
              borderLeftColor: "transparent",
            }
      }
      className={[
        "flex items-center rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-90",
        "border-l-[3px]",
        active ? "sidebar-link-active" : "sidebar-link-inactive",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export function PrimaryLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        backgroundColor: "hsl(var(--primary))",
        color: "hsl(var(--primary-foreground))",
      }}
      className="button-primary inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90"
    >
      {children}
    </Link>
  );
}

export function SecondaryLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        backgroundColor: "transparent",
        color: "hsl(var(--foreground))",
        borderColor: "hsl(var(--border))",
      }}
      className="button-secondary inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90"
    >
      {children}
    </Link>
  );
}

export function StatusChip({
  tone,
  children,
}: {
  tone: "info" | "success" | "warning" | "error";
  children: ReactNode;
}) {
  const toneClass = {
    info: "border-[hsl(var(--variant-info-border))] bg-[hsl(var(--variant-info-bg))] text-[hsl(var(--variant-info-text))]",
    success:
      "border-[hsl(var(--variant-success-border))] bg-[hsl(var(--variant-success-bg))] text-[hsl(var(--variant-success-text))]",
    warning:
      "border-[hsl(var(--variant-warning-border))] bg-[hsl(var(--variant-warning-bg))] text-[hsl(var(--variant-warning-text))]",
    error:
      "border-[hsl(var(--variant-error-border))] bg-[hsl(var(--variant-error-bg))] text-[hsl(var(--variant-error-text))]",
  }[tone];

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}
    >
      {children}
    </span>
  );
}

export function MetricBox({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="surface-card p-4">
      <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
        {label}
      </p>
      <p className="mt-3 font-mono-data text-3xl font-bold tracking-tight">
        {value}
      </p>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        {subtext}
      </p>
    </div>
  );
}

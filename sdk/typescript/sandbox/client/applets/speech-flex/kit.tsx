/**
 * Design-kit primitives for the Speech Flex full-screen app.
 *
 * Implements the Corti clinical app visual language — monochrome surfaces,
 * tiny uppercase eyebrow labels, compact card headers, and the corti-lime as
 * the single accent. No external UI framework: just Tailwind utilities.
 */

import type { LucideIcon } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../_shared/utils";

/** Tiny uppercase label used for section headers throughout the app. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/60",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Bordered surface card (rounded-md, background surface). */
export function Card({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      className={cn("rounded-md border border-border bg-background", className)}
      {...props}
    />
  );
}

/**
 * Card header — `icon · SECTION TITLE` on the left, optional meta on the
 * right. Meta is usually a timestamp (mono) or a small action.
 */
export function CardHeader({
  icon: Icon,
  title,
  meta,
  iconClassName,
}: {
  icon: LucideIcon;
  title: string;
  meta?: ReactNode;
  iconClassName?: string;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Icon size={13} className={cn("text-muted-foreground", iconClassName)} />
        <Eyebrow>{title}</Eyebrow>
      </div>
      {meta && <div className="text-[11px] text-muted-foreground">{meta}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Button                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "outline" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-foreground text-background hover:bg-foreground/85 disabled:bg-foreground/30",
  outline:
    "border border-border bg-background text-foreground hover:bg-muted disabled:text-muted-foreground",
  ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[5px] font-medium transition-colors disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-9 px-3.5 text-[13px]",
        size === "lg" && "h-10 px-4 text-[13.5px]",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Badge                                                              */
/* ------------------------------------------------------------------ */

type BadgeTone = "neutral" | "warning" | "success" | "error" | "info";

const badgeToneClasses: Record<BadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  warning: "bg-background text-foreground/80 border-border [&_svg]:text-warning",
  success: "bg-background text-foreground/80 border-border [&_svg]:text-success",
  error: "bg-variant-error-bg text-variant-error-text border-variant-error-border",
  info: "bg-background text-foreground/80 border-border [&_svg]:text-info",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-px text-[11px] font-medium leading-4",
        badgeToneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Callout                                                            */
/* ------------------------------------------------------------------ */

type CalloutTone = "error" | "warning" | "info" | "success";

const calloutToneClasses: Record<CalloutTone, string> = {
  error: "bg-variant-error-bg text-variant-error-text border-variant-error-border",
  warning: "bg-variant-warning-bg text-variant-warning-text border-variant-warning-border",
  info: "bg-variant-info-bg text-variant-info-text border-variant-info-border",
  success: "bg-variant-success-bg text-variant-success-text border-variant-success-border",
};

export function Callout({
  tone,
  icon: Icon,
  title,
  children,
  className,
}: {
  tone: CalloutTone;
  icon?: LucideIcon;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3.5 py-3",
        calloutToneClasses[tone],
        className,
      )}
    >
      {Icon && <Icon size={14} className="mt-0.5 shrink-0" />}
      <div className="text-[13px] leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5 opacity-90" : undefined}>{children}</div>
      </div>
    </div>
  );
}

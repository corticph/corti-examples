import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-soft disabled:bg-muted-500 disabled:cursor-not-allowed",
  secondary: "bg-paper text-ink border border-muted-300 hover:bg-paper-muted disabled:opacity-50",
  ghost: "bg-transparent text-ink hover:bg-paper-muted disabled:opacity-50",
  danger: "bg-paper text-red-700 border border-red-300 hover:bg-red-50 disabled:opacity-50",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

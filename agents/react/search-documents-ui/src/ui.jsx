import { ArrowLeft } from "lucide-react";

export const MONO = { fontFamily: "'IBM Plex Mono', monospace" };

const VARIANT = {
  error: ["--variant-error-bg", "--variant-error-border", "--variant-error-text"],
  success: ["--variant-success-bg", "--variant-success-border", "--variant-success-text"],
  warning: ["--variant-warning-bg", "--variant-warning-border", "--variant-warning-text"],
};

export function Banner({ variant = "error", className = "", children }) {
  const [bg, border, text] = VARIANT[variant] ?? VARIANT.error;
  return (
    <div
      className={`rounded-md border p-3 text-xs ${className}`}
      style={{
        background: `hsl(var(${bg}))`,
        borderColor: `hsl(var(${border}))`,
        color: `hsl(var(${text}))`,
      }}
    >
      {children}
    </div>
  );
}

export function ScreenHeader({ title, onBack, right = null }) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border">
      <div className="flex-1 flex justify-start">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        )}
      </div>
      <span className="text-sm font-semibold text-foreground truncate">{title}</span>
      <div className="flex-1 flex justify-end items-center gap-3">{right}</div>
    </header>
  );
}

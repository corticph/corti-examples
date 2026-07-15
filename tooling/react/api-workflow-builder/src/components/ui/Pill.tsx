import type { ReactNode } from "react";

type Tone = "neutral" | "good" | "warn" | "bad" | "accent";

const tones: Record<Tone, string> = {
  neutral: "bg-paper-muted text-muted-700 border-muted-300",
  good: "bg-accent-soft text-ink border-accent/40",
  warn: "bg-amber-50 text-amber-900 border-amber-200",
  bad: "bg-red-50 text-red-700 border-red-200",
  accent: "bg-ink text-paper border-ink",
};

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

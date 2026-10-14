import { FORMATTING_CATEGORIES } from "./formattingOptions";

export function FormattingDetails() {
  return (
    <dl className="flex flex-col gap-3">
      {FORMATTING_CATEGORIES.map((cat) => (
        <div key={cat.key} className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {cat.label}
          </dt>
          <dd className="text-sm text-foreground">
            {cat.options.map((opt, i) => (
              <span key={opt.value}>
                {i > 0 && " · "}
                <span className={opt.isDefault ? "font-semibold" : ""}>{opt.label}</span>
                {opt.isDefault && " (default)"}
              </span>
            ))}
          </dd>
        </div>
      ))}
      <div className="pt-2 text-xs text-muted-foreground">
        Locale-based options (dates, times) format according to the{" "}
        <code className="font-mono">primaryLanguage</code> in the config. See the{" "}
        <a
          href="https://docs.corti.ai/stt/formatting"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          formatting docs
        </a>{" "}
        for per-language examples.
      </div>
    </dl>
  );
}

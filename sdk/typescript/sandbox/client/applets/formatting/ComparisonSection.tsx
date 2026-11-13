import { Eraser, Mic, Square } from "lucide-react";
import { useEffect } from "react";
import { useDictationLanguage } from "../_shared/useDictationLanguage";
import { cn } from "../_shared/utils";
import { useComparisonConnections } from "./comparisonConnection";
import { FORMATTING_CATEGORIES, type FormattingCategory } from "./formattingOptions";

const STATUS_STYLES: Record<string, string> = {
  idle: "bg-muted text-muted-foreground",
  connecting: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  connected: "bg-green-500/15 text-green-700 dark:text-green-400",
  paused: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  error: "bg-red-500/15 text-red-700 dark:text-red-400",
  closed: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  connected: "Live",
  paused: "Paused",
  error: "Error",
  closed: "Closed",
};

export function ComparisonSection({
  selectedCategory,
  onSelectCategory,
}: {
  selectedCategory: FormattingCategory;
  onSelectCategory: (category: FormattingCategory) => void;
}) {
  const { language } = useDictationLanguage();
  const { connections, isRecording, error, level, start, stop, clear, teardown } =
    useComparisonConnections(language);

  useEffect(() => teardown, [teardown]);

  const handleStart = () => {
    start(selectedCategory);
  };

  const handleStop = () => {
    stop();
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Comparison mode</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a formatting category and dictate the same phrase into every option simultaneously.
          One microphone fans audio to parallel WebSocket connections, each with a different
          formatting setting for the chosen category.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Category
        </span>
        <div className="flex flex-wrap gap-2">
          {FORMATTING_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => onSelectCategory(cat)}
              disabled={isRecording}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
                selectedCategory.key === cat.key
                  ? "bg-corti-lime text-corti-lime-foreground"
                  : "border border-border bg-background text-foreground hover:bg-accent",
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={isRecording ? handleStop : handleStart}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
            isRecording
              ? "bg-variant-error text-variant-error-foreground"
              : "bg-corti-lime text-corti-lime-foreground",
          )}
        >
          {isRecording ? (
            <>
              <Square className="h-4 w-4" /> Stop
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" /> Record
            </>
          )}
        </button>

        <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-corti-lime transition-[width] duration-75"
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>

        {connections.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Eraser className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      {error && <p className="text-sm text-variant-error-foreground">{error}</p>}

      {connections.length > 0 && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          {connections.map((conn) => (
            <div
              key={conn.option.value}
              className="flex flex-col gap-2 rounded-md border border-border bg-background p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{conn.option.label}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    STATUS_STYLES[conn.status] ?? STATUS_STYLES.idle,
                  )}
                >
                  {STATUS_LABELS[conn.status] ?? conn.status}
                </span>
              </div>
              {conn.option.isDefault && (
                <span className="text-xs text-muted-foreground">Server default</span>
              )}
              {conn.error && <p className="text-xs text-variant-error-foreground">{conn.error}</p>}
              <div className="min-h-[100px] rounded-md bg-muted/40 p-2 text-sm leading-relaxed text-foreground">
                {conn.final ||
                  (conn.interim ? (
                    <span className="italic text-muted-foreground">{conn.interim}</span>
                  ) : (
                    <span className="italic text-muted-foreground">
                      Transcript will appear here…
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

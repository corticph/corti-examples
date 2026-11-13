/**
 * Formatting configuration for the `/transcribe` endpoint.
 *
 * Controls how dates, times, numbers, measurements, numeric ranges, and
 * ordinals are rendered in transcript output. When no formatting config is
 * sent, the server applies locale-aware defaults automatically.
 *
 * See https://docs.corti.ai/stt/formatting for the full option reference.
 */
import type { FormattingConfig } from "./types";

/** Server-side defaults — applied when no formatting config is sent. */
export const DEFAULT_FORMATTING: FormattingConfig = {
  dates: "locale:long",
  times: "locale",
  numbers: "numerals_above_nine",
  measurements: "abbreviated",
  numericRanges: "numerals",
  ordinals: "numerals_above_nine",
};

/** UI-facing option lists for each formatting field. */
export const FORMATTING_OPTIONS = {
  dates: [
    { value: "locale:long", label: "Locale: long" },
    { value: "locale:medium", label: "Locale: medium" },
    { value: "locale:short", label: "Locale: short" },
    { value: "iso", label: "ISO 8601 (2025-02-03)" },
    { value: "as_dictated", label: "As dictated" },
  ],
  times: [
    { value: "locale", label: "Locale" },
    { value: "h24", label: "24-hour (16:00)" },
    { value: "h12", label: "12-hour (4:00 PM)" },
    { value: "as_dictated", label: "As dictated" },
  ],
  numbers: [
    { value: "numerals_above_nine", label: "Numbers 10+ as numerals" },
    { value: "numerals", label: "All numbers as numerals" },
    { value: "as_dictated", label: "As dictated" },
  ],
  measurements: [
    { value: "abbreviated", label: "Abbreviated (mm, cm, in)" },
    { value: "as_dictated", label: "As dictated" },
  ],
  numericRanges: [
    { value: "numerals", label: "Numerals (1-10)" },
    { value: "as_dictated", label: "As dictated" },
  ],
  ordinals: [
    { value: "numerals_above_nine", label: "Ordinals 10+ as numerals" },
    { value: "numerals", label: "Numerals (1st, 2nd)" },
    { value: "as_dictated", label: "As dictated" },
  ],
} as const;

/** Human-readable labels for each formatting field, shown in the UI. */
export const FORMATTING_FIELD_LABELS: {
  key: keyof FormattingConfig;
  label: string;
}[] = [
  { key: "dates", label: "Dates" },
  { key: "times", label: "Times" },
  { key: "numbers", label: "Numbers" },
  { key: "measurements", label: "Measurements" },
  { key: "numericRanges", label: "Numeric ranges" },
  { key: "ordinals", label: "Ordinals" },
];

/**
 * Returns only the formatting fields that differ from server defaults.
 * When all values are default, returns `undefined` so the server applies
 * its own locale-aware defaults automatically.
 */
export function buildFormattingOverrides(
  formatting: FormattingConfig,
): Partial<FormattingConfig> | undefined {
  const overrides: Partial<FormattingConfig> = {};
  for (const key of Object.keys(formatting) as (keyof FormattingConfig)[]) {
    if (formatting[key] !== DEFAULT_FORMATTING[key]) {
      overrides[key] = formatting[key];
    }
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

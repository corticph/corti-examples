export type FormattingCategoryKey =
  | "dates"
  | "times"
  | "numbers"
  | "measurements"
  | "numericRanges"
  | "ordinals";

export interface FormattingOption {
  value: string;
  label: string;
  isDefault: boolean;
}

export interface FormattingCategory {
  key: FormattingCategoryKey;
  label: string;
  description: string;
  options: FormattingOption[];
}

export interface FormattingConfig {
  dates: string;
  times: string;
  numbers: string;
  measurements: string;
  numericRanges: string;
  ordinals: string;
}

export const DEFAULT_FORMATTING: FormattingConfig = {
  dates: "locale:long",
  times: "locale",
  numbers: "numerals_above_nine",
  measurements: "abbreviated",
  numericRanges: "numerals",
  ordinals: "numerals_above_nine",
};

export const FORMATTING_CATEGORIES: FormattingCategory[] = [
  {
    key: "dates",
    label: "Dates",
    description: "How spoken dates are written in the transcript",
    options: [
      { value: "locale:long", label: "Locale: Long", isDefault: true },
      { value: "locale:medium", label: "Locale: Medium", isDefault: false },
      { value: "locale:short", label: "Locale: Short", isDefault: false },
      { value: "iso", label: "ISO 8601", isDefault: false },
      { value: "as_dictated", label: "As dictated", isDefault: false },
    ],
  },
  {
    key: "times",
    label: "Times",
    description: "How spoken times are written in the transcript",
    options: [
      { value: "locale", label: "Locale", isDefault: true },
      { value: "h24", label: "24-hour", isDefault: false },
      { value: "h12", label: "12-hour", isDefault: false },
    ],
  },
  {
    key: "numbers",
    label: "Numbers",
    description: "How spoken numbers are written in the transcript",
    options: [
      { value: "numerals_above_nine", label: "Numerals above nine", isDefault: true },
      { value: "numerals", label: "All numerals", isDefault: false },
      { value: "as_dictated", label: "As dictated", isDefault: false },
    ],
  },
  {
    key: "measurements",
    label: "Measurements",
    description: "How spoken units and measurements are written",
    options: [
      { value: "abbreviated", label: "Abbreviated", isDefault: true },
      { value: "as_dictated", label: "As dictated", isDefault: false },
    ],
  },
  {
    key: "numericRanges",
    label: "Numeric ranges",
    description: "How spoken numeric ranges (e.g. one to ten) are written",
    options: [
      { value: "numerals", label: "Numerals", isDefault: true },
      { value: "as_dictated", label: "As dictated", isDefault: false },
    ],
  },
  {
    key: "ordinals",
    label: "Ordinals",
    description: "How spoken ordinals (first, second, third) are written",
    options: [
      { value: "numerals_above_nine", label: "Numerals above nine", isDefault: true },
      { value: "numerals", label: "All numerals", isDefault: false },
      { value: "as_dictated", label: "As dictated", isDefault: false },
    ],
  },
];

export function getCategoryByKey(key: FormattingCategoryKey): FormattingCategory {
  const category = FORMATTING_CATEGORIES.find((c) => c.key === key);
  if (!category) {
    throw new Error(`Unknown formatting category: ${key}`);
  }
  return category;
}

export function stripDefaultFormatting(config: FormattingConfig): Partial<FormattingConfig> {
  const result: Partial<FormattingConfig> = {};
  for (const category of FORMATTING_CATEGORIES) {
    if (config[category.key] !== DEFAULT_FORMATTING[category.key]) {
      result[category.key] = config[category.key];
    }
  }
  return result;
}

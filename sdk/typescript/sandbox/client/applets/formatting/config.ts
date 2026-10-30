import type { Corti } from "@corti/sdk";
import {
  DEFAULT_FORMATTING,
  type FormattingCategory,
  type FormattingCategoryKey,
  type FormattingConfig,
  type FormattingOption,
  stripDefaultFormatting,
} from "./formattingOptions";

export function buildFormattingConfig(
  primaryLanguage: string,
  formatting: FormattingConfig,
): Corti.TranscribeConfig {
  const formattingPayload = stripDefaultFormatting(formatting);
  return {
    primaryLanguage,
    interimResults: true,
    spokenPunctuation: true,
    audioEvents: { enabled: true },
    ...(Object.keys(formattingPayload).length > 0 ? { formatting: formattingPayload } : {}),
  } as unknown as Corti.TranscribeConfig;
}

export function buildComparisonConfigs(
  primaryLanguage: string,
  category: FormattingCategory,
): Array<{ option: FormattingOption; config: Corti.TranscribeConfig }> {
  return category.options.map((option) => ({
    option,
    config: {
      primaryLanguage,
      interimResults: true,
      spokenPunctuation: true,
      audioEvents: { enabled: true },
      formatting: {
        ...DEFAULT_FORMATTING,
        [category.key]: option.value,
      },
    } as unknown as Corti.TranscribeConfig,
  }));
}

export function buildConfigForCategoryOption(
  primaryLanguage: string,
  categoryKey: FormattingCategoryKey,
  optionValue: string,
): Corti.TranscribeConfig {
  return {
    primaryLanguage,
    interimResults: true,
    spokenPunctuation: true,
    audioEvents: { enabled: true },
    formatting: {
      ...DEFAULT_FORMATTING,
      [categoryKey]: optionValue,
    },
  } as unknown as Corti.TranscribeConfig;
}

// Languages officially supported by the Corti API (per docs.corti.ai/about/languages).
// Codes are BCP-47. Flags are emoji — render natively on macOS/iOS/Android.

export type LanguageOption = {
  code: string;
  name: string;
  flag: string;
};

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "ar", name: "Arabic", flag: "🇸🇦" },
  { code: "da", name: "Danish", flag: "🇩🇰" },
  { code: "nl", name: "Dutch", flag: "🇳🇱" },
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "en-US", name: "English (US)", flag: "🇺🇸" },
  { code: "en-GB", name: "English (UK)", flag: "🇬🇧" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "hu", name: "Hungarian", flag: "🇭🇺" },
  { code: "it", name: "Italian", flag: "🇮🇹" },
  { code: "no", name: "Norwegian", flag: "🇳🇴" },
  { code: "pt", name: "Portuguese", flag: "🇵🇹" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "sv", name: "Swedish", flag: "🇸🇪" },
  { code: "gsw-CH", name: "Swiss German (dialect)", flag: "🇨🇭" },
  { code: "de-CH", name: "Swiss High German", flag: "🇨🇭" },
];

export const LANGUAGE_CODES: string[] = SUPPORTED_LANGUAGES.map((l) => l.code);

export const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((l) => [l.code, `${l.flag}  ${l.name}  (${l.code})`]),
);

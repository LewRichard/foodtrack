// Supported languages, shared by the app and the server.

export const LANGUAGE_CODES = ["en", "vi", "es", "pt", "fr", "de", "zh", "ja", "ko"] as const;
export type Lang = (typeof LANGUAGE_CODES)[number];

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGUAGE_CODES as readonly string[]).includes(value);
}

/** How the AI is told which language to answer in. */
export const AI_LANGUAGE_NAMES: Record<Lang, string> = {
  en: "English",
  vi: "Vietnamese",
  es: "Spanish",
  pt: "Brazilian Portuguese",
  fr: "French",
  de: "German",
  zh: "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
};

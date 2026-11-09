// Translations. Every language file must define exactly the keys in en.ts (TypeScript checks this),
// so a missing translation is a build error rather than a blank button.

import { createElement, Fragment, useMemo, type ReactNode } from "react";
import { isLang, type Lang } from "../../shared/languages.ts";
import { getState, useAppState } from "../lib/store.ts";
import de from "./de.ts";
import en from "./en.ts";
import es from "./es.ts";
import fr from "./fr.ts";
import ja from "./ja.ts";
import ko from "./ko.ts";
import pt from "./pt.ts";
import vi from "./vi.ts";
import zh from "./zh.ts";

export const LANGUAGES = [
  { code: "en", name: "English", locale: "en-US" },
  { code: "vi", name: "Tiếng Việt", locale: "vi-VN" },
  { code: "es", name: "Español", locale: "es-ES" },
  { code: "pt", name: "Português", locale: "pt-BR" },
  { code: "fr", name: "Français", locale: "fr-FR" },
  { code: "de", name: "Deutsch", locale: "de-DE" },
  { code: "zh", name: "中文（简体）", locale: "zh-CN" },
  { code: "ja", name: "日本語", locale: "ja-JP" },
  { code: "ko", name: "한국어", locale: "ko-KR" },
] as const;

export type { Lang };
export type LanguagePref = Lang | "auto";
export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
type Vars = Record<string, string | number>;

const MESSAGES: Record<Lang, Messages> = { en, vi, es, pt, fr, de, zh, ja, ko };

/** The device's preferred supported language, e.g. ["vi-VN", "en"] → "vi". English if none match. */
export function deviceLanguage(preferred: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]): Lang {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLang(base)) return base;
  }
  return "en";
}

export function resolveLanguage(pref: LanguagePref | undefined): Lang {
  return pref && pref !== "auto" && isLang(pref) ? pref : deviceLanguage();
}

export function localeOf(lang: Lang): string {
  return LANGUAGES.find((l) => l.code === lang)!.locale;
}

/** Fills {placeholders}. Unknown placeholders are left as they are. */
function fill(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  return fill(MESSAGES[lang][key] ?? en[key], vars);
}

/** Picks key + "_one" / "_other" with the language's plural rules, passing n as {n}. */
export function translatePlural(lang: Lang, base: string, n: number, vars?: Vars): string {
  const form = new Intl.PluralRules(localeOf(lang)).select(n) === "one" ? "one" : "other";
  return translate(lang, `${base}_${form}` as MessageKey, { n, ...vars });
}

/** The current language, for code outside React components (e.g. error messages in lib/). */
export function currentLanguage(): Lang {
  return resolveLanguage(getState().language);
}

/** Translate outside React components. */
export function t(key: MessageKey, vars?: Vars): string {
  return translate(currentLanguage(), key, vars);
}

export interface I18n {
  lang: Lang;
  locale: string;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Plural-aware translation: base key with _one / _other variants. */
  tp: (base: string, n: number, vars?: Vars) => string;
  /** Translation with React nodes in it, e.g. tr("consent.footer", { link: <a>…</a> }). */
  tr: (key: MessageKey, nodes: Record<string, ReactNode>) => ReactNode;
  /** Formats a number for this language (1,420 / 1.420 / 1 420). */
  num: (n: number, digits?: number) => string;
  /** Formats a date with Intl options, in this language. */
  date: (d: Date, options: Intl.DateTimeFormatOptions) => string;
}

export function makeI18n(lang: Lang): I18n {
  const locale = localeOf(lang);
  const numberFormats = new Map<number, Intl.NumberFormat>();
  return {
    lang,
    locale,
    t: (key, vars) => translate(lang, key, vars),
    tp: (base, n, vars) => translatePlural(lang, base, n, vars),
    tr: (key, nodes) => {
      const parts = translate(lang, key).split(/(\{\w+\})/);
      return createElement(
        Fragment,
        null,
        ...parts.map((part, i) => {
          const name = /^\{(\w+)\}$/.exec(part)?.[1];
          return name && name in nodes ? createElement(Fragment, { key: i }, nodes[name]) : part;
        }),
      );
    },
    num: (n, digits = 0) => {
      let f = numberFormats.get(digits);
      if (!f) {
        f = new Intl.NumberFormat(locale, { maximumFractionDigits: digits });
        numberFormats.set(digits, f);
      }
      return f.format(n);
    },
    date: (d, options) => d.toLocaleDateString(locale, options),
  };
}

/** Translation helpers for the current language; re-renders when the language changes. */
export function useI18n(): I18n {
  const { language } = useAppState();
  const lang = resolveLanguage(language);
  return useMemo(() => makeI18n(lang), [lang]);
}

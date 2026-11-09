import { describe, expect, it } from "vitest";
import { LANGUAGE_CODES } from "../shared/languages.ts";
import { reminderText } from "../shared/reminders.ts";
import en from "../src/i18n/en.ts";
import { FOOD_NAMES, PORTION_KEYS, PORTIONS } from "../src/i18n/foods.ts";
import { deviceLanguage, makeI18n, resolveLanguage, translate, translatePlural } from "../src/i18n/index.ts";
import { FOODS, searchFoods } from "../src/lib/foods.ts";
import de from "../src/i18n/de.ts";
import es from "../src/i18n/es.ts";
import fr from "../src/i18n/fr.ts";
import ja from "../src/i18n/ja.ts";
import ko from "../src/i18n/ko.ts";
import pt from "../src/i18n/pt.ts";
import vi from "../src/i18n/vi.ts";
import zh from "../src/i18n/zh.ts";

const ALL = { vi, es, pt, fr, de, zh, ja, ko };
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  for (const [lang, messages] of Object.entries(ALL)) {
    it(`${lang} has every key, no blanks, and the same placeholders as English`, () => {
      expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
      for (const [key, english] of Object.entries(en)) {
        const text = messages[key as keyof typeof en];
        expect(text.trim(), `${lang}:${key}`).not.toBe("");
        expect(placeholders(text), `${lang}:${key}`).toEqual(placeholders(english));
      }
    });
  }

  it("names every built-in food and portion in every language", () => {
    for (const names of Object.values(FOOD_NAMES)) expect(names).toHaveLength(FOODS.length);
    const portions = new Set(FOODS.map((f) => f.portion));
    expect(new Set(PORTION_KEYS)).toEqual(portions);
    for (const map of Object.values(PORTIONS)) for (const p of portions) expect(map.get(p)).toBeTruthy();
  });

  it("has reminder texts for every language", () => {
    for (const lang of LANGUAGE_CODES) expect(reminderText(lang, "lunch").title).toBeTruthy();
  });
});

describe("language choice", () => {
  it("picks the first supported device language, else English", () => {
    expect(deviceLanguage(["vi-VN", "en-US"])).toBe("vi");
    expect(deviceLanguage(["it-IT", "pt-BR"])).toBe("pt");
    expect(deviceLanguage(["zh_Hans_CN"])).toBe("zh");
    expect(deviceLanguage(["it-IT"])).toBe("en");
    expect(deviceLanguage([])).toBe("en");
  });

  it("uses the saved choice over the device", () => {
    expect(resolveLanguage("ja")).toBe("ja");
    expect(resolveLanguage("xx" as never)).toBe(deviceLanguage());
  });
});

describe("formatting", () => {
  it("fills placeholders and picks plural forms", () => {
    expect(translate("en", "greet.withName", { greeting: "Hi", name: "An" })).toBe("Hi, An");
    expect(translatePlural("en", "scan.items", 1)).toContain("1");
    expect(translatePlural("en", "scan.items", 1)).not.toBe(translatePlural("en", "scan.items", 2).replace("2", "1"));
    expect(translatePlural("ja", "scan.items", 3)).toContain("3");
  });

  it("formats numbers for the locale", () => {
    expect(makeI18n("de").num(1234.5, 1)).toBe("1.234,5");
    expect(makeI18n("en").num(1234.5, 1)).toBe("1,234.5");
  });
});

describe("food search", () => {
  it("shows translated names and portions", () => {
    const [apple] = searchFoods("táo", "vi");
    expect(apple).toMatchObject({ name: "Táo", portion: "1 (cỡ vừa)", calories: 95 });
  });

  it("ignores accents and still matches English names", () => {
    expect(searchFoods("trung luoc", "vi").map((f) => f.name)).toEqual(["Trứng luộc"]);
    expect(searchFoods("dau phu", "vi").map((f) => f.name)).toEqual(["Đậu phụ"]);
    expect(searchFoods("salmon", "ja").map((f) => f.name)).toContain("焼き鮭");
    expect(searchFoods("cafe", "fr").map((f) => f.name)).toContain("Café noir");
  });
});

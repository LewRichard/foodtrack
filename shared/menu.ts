// Restaurant menus read from a photo: each dish with estimated nutrition and how well it fits
// what the person has left to eat today. Shared by the server (cleaning) and the app (ranking).

import { clampHealthScore, type FoodItem } from "./nutrition.ts";

export const MENU_FITS = ["best", "good", "ok", "avoid"] as const;
export type MenuFit = (typeof MENU_FITS)[number];

export interface MenuDish extends FoodItem {
  /** As printed on the menu. */
  menuName: string;
  /** In the app's language when the menu is in another one, otherwise "". */
  translated: string;
  /** As printed, e.g. "$12.50" or "85k"; "" when there's no price. */
  price: string;
  healthScore: number; // 1–10
  fit: MenuFit;
  /** One short sentence on why it fits or doesn't. */
  reason: string;
  /** An easy way to order it lighter (sauce on the side, half rice…), or "". */
  tip: string;
}

export interface MenuResult {
  isMenu: boolean;
  restaurant: string;
  dishes: MenuDish[];
  /** One or two sentences on what to order here. */
  advice: string;
}

/** What the app sends along with the photos so picks match the person's day. */
export interface MenuContext {
  remaining: { calories: number; protein: number; carbs: number; fat: number };
  goal: "lose" | "maintain" | "gain" | null;
  preferences: string;
}

export const MAX_MENU_PHOTOS = 3;
export const MAX_DISHES = 40;

const num = (v: unknown, digits = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Makes a model's menu safe to show: sane numbers, known enums, no duplicates, at most MAX_DISHES. */
export function cleanMenu(raw: unknown): MenuResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const dishes: MenuDish[] = [];
  for (const d of Array.isArray(r.dishes) ? (r.dishes as Record<string, unknown>[]) : []) {
    const menuName = str(d?.menuName, 120);
    const key = menuName.toLowerCase();
    if (!menuName || seen.has(key)) continue;
    seen.add(key);
    const translated = str(d.translated, 120);
    dishes.push({
      menuName,
      translated: translated.toLowerCase() === key ? "" : translated,
      name: translated && translated.toLowerCase() !== key ? translated : menuName,
      price: str(d.price, 30),
      portion: str(d.portion, 60) || "1 serving",
      grams: num(d.grams),
      calories: num(d.calories),
      protein: num(d.protein, 1),
      carbs: num(d.carbs, 1),
      fat: num(d.fat, 1),
      fiber: num(d.fiber, 1),
      sugar: num(d.sugar, 1),
      sodium: num(d.sodium),
      confidence: d.confidence === "high" || d.confidence === "low" ? d.confidence : "medium",
      healthScore: clampHealthScore(d.healthScore) ?? 5,
      fit: MENU_FITS.includes(d.fit as MenuFit) ? (d.fit as MenuFit) : "ok",
      reason: str(d.reason, 240),
      tip: str(d.tip, 200),
    });
    if (dishes.length >= MAX_DISHES) break;
  }
  return {
    isMenu: r.isMenu !== false && dishes.length > 0,
    restaurant: str(r.restaurant, 80),
    dishes,
    advice: str(r.advice, 400),
  };
}

const FIT_ORDER: Record<MenuFit, number> = { best: 0, good: 1, ok: 2, avoid: 3 };

/**
 * The dishes to suggest first: best fit, then healthier, then closest to the calories left
 * (a dish far over what's left drops down). Never suggests "avoid" dishes.
 */
export function topPicks(menu: MenuResult, caloriesLeft: number, count = 3): MenuDish[] {
  const over = (d: MenuDish) => Math.max(0, d.calories - Math.max(caloriesLeft, 0));
  return menu.dishes
    .filter((d) => d.fit !== "avoid")
    .map((d, i) => ({ d, i }))
    .sort(
      (a, b) =>
        FIT_ORDER[a.d.fit] - FIT_ORDER[b.d.fit] ||
        over(a.d) - over(b.d) ||
        b.d.healthScore - a.d.healthScore ||
        a.i - b.i,
    )
    .slice(0, count)
    .map(({ d }) => d);
}

/** What the app has left for today, never below zero. */
export function remainingFor(goals: { calories: number; protein: number; carbs: number; fat: number }, eaten: { calories: number; protein: number; carbs: number; fat: number }): MenuContext["remaining"] {
  const left = (k: keyof MenuContext["remaining"]) => Math.max(0, Math.round(goals[k] - eaten[k]));
  return { calories: left("calories"), protein: left("protein"), carbs: left("carbs"), fat: left("fat") };
}

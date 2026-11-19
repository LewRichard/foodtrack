// A food or a whole meal shared into a friend chat. It arrives from another person, so it's
// cleaned before it's shown or logged.

import type { FoodItem } from "./nutrition.ts";

export interface SharedFood {
  title: string;
  items: FoodItem[];
  /** Small JPEG thumbnail (data URL) of the meal photo, if there was one. */
  photo?: string;
}

export const MAX_SHARED_ITEMS = 20;
const MAX_PHOTO_CHARS = 40_000;

const num = (v: unknown, digits: number, max: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  const f = 10 ** digits;
  return Math.min(max, Math.round(n * f) / f);
};
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

function cleanItem(raw: unknown): FoodItem | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = str(r.name, 100);
  if (!name) return null;
  return {
    name,
    portion: str(r.portion, 60),
    grams: num(r.grams, 0, 5000),
    calories: num(r.calories, 0, 10000),
    protein: num(r.protein, 1, 1000),
    carbs: num(r.carbs, 1, 2000),
    fat: num(r.fat, 1, 1000),
    fiber: num(r.fiber, 1, 500),
    sugar: num(r.sugar, 1, 2000),
    sodium: num(r.sodium, 0, 100000),
    confidence: r.confidence === "high" || r.confidence === "low" ? r.confidence : "medium",
  };
}

/** Returns a safe copy, or null when there's nothing usable in it. */
export function cleanSharedFood(raw: unknown): SharedFood | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const items = (Array.isArray(r.items) ? r.items : []).slice(0, MAX_SHARED_ITEMS).map(cleanItem).filter((i): i is FoodItem => i !== null);
  if (!items.length) return null;
  const photo = typeof r.photo === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(r.photo) && r.photo.length <= MAX_PHOTO_CHARS ? r.photo : undefined;
  return { title: str(r.title, 80) || items[0].name, items, ...(photo ? { photo } : {}) };
}

/** What to send for some diary items: just the food, never dates, ids or health data. */
export function shareFoodFrom(title: string, items: readonly FoodItem[], photo?: string): SharedFood {
  return cleanSharedFood({ title, items, photo }) ?? { title, items: [] };
}

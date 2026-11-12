// A nutrition label read from a photo: one serving's values, as printed on the package.

import type { FoodItem } from "./nutrition.ts";

export interface LabelResult {
  isLabel: boolean;
  productName: string;
  servingSize: string;
  servingGrams: number; // 0 = not printed
  servingsPerContainer: number; // 0 = not printed
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  notes: string;
}

const num = (v: unknown, digits = 0, max = 100000): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  const f = 10 ** digits;
  return Math.min(max, Math.round(n * f) / f);
};
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Makes a model's reading safe to show and log. */
export function cleanLabel(raw: unknown): LabelResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const label: LabelResult = {
    isLabel: r.isLabel !== false,
    productName: str(r.productName, 100),
    servingSize: str(r.servingSize, 60),
    servingGrams: num(r.servingGrams, 0, 5000),
    servingsPerContainer: num(r.servingsPerContainer, 1, 500),
    calories: num(r.calories, 0, 5000),
    protein: num(r.protein, 1, 500),
    carbs: num(r.carbs, 1, 1000),
    fat: num(r.fat, 1, 500),
    fiber: num(r.fiber, 1, 200),
    sugar: num(r.sugar, 1, 1000),
    sodium: num(r.sodium, 0, 50000),
    notes: str(r.notes, 300),
  };
  // Nothing readable at all isn't a label.
  if (!label.calories && !label.protein && !label.carbs && !label.fat) label.isLabel = false;
  return label;
}

/** One serving as a diary item. Label values are printed, so confidence is high. */
export function labelServing(l: LabelResult, fallbackName: string): FoodItem {
  return {
    name: l.productName || fallbackName,
    portion: l.servingSize || "1 serving",
    grams: l.servingGrams,
    calories: l.calories,
    protein: l.protein,
    carbs: l.carbs,
    fat: l.fat,
    fiber: l.fiber,
    sugar: l.sugar,
    sodium: l.sodium,
    confidence: "high",
  };
}

// The AI meal plan (returned by POST /api/mealplan).

import type { Nutrients } from "./nutrition.ts";

export type PlanMealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface PlanMeal extends Nutrients {
  meal: PlanMealType;
  name: string;
  portion: string;
  grams: number;
  recipe: string; // one or two sentences on how to make it
}

export interface PlanDay {
  meals: PlanMeal[];
}

export interface ShoppingGroup {
  category: string;
  items: { name: string; amount: string }[];
}

export interface MealPlan {
  title: string;
  days: PlanDay[];
  shopping: ShoppingGroup[];
  tips: string[];
}

export const PLAN_LENGTHS = [1, 3, 7] as const;
export type PlanLength = (typeof PLAN_LENGTHS)[number];

const MEAL_ORDER: PlanMealType[] = ["breakfast", "lunch", "dinner", "snack"];
const num = (v: unknown, max: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n * 10) / 10)) : 0;
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Makes a model-written plan safe to show and log: clamps numbers, trims text, keeps the asked-for days. */
export function cleanPlan(raw: MealPlan, length: number): MealPlan {
  const days = raw.days.slice(0, length).map((d) => ({
    meals: d.meals
      .filter((m) => MEAL_ORDER.includes(m.meal) && text(m.name, 120))
      .slice(0, 8)
      .map((m) => ({
        meal: m.meal,
        name: text(m.name, 120),
        portion: text(m.portion, 80),
        grams: Math.round(num(m.grams, 3000)),
        calories: Math.round(num(m.calories, 5000)),
        protein: num(m.protein, 500),
        carbs: num(m.carbs, 1000),
        fat: num(m.fat, 500),
        fiber: num(m.fiber, 200),
        sugar: num(m.sugar, 500),
        sodium: Math.round(num(m.sodium, 20000)),
        recipe: text(m.recipe, 400),
      }))
      .sort((a, b) => MEAL_ORDER.indexOf(a.meal) - MEAL_ORDER.indexOf(b.meal)),
  }));
  const shopping = raw.shopping
    .map((g) => ({
      category: text(g.category, 60),
      items: g.items.map((i) => ({ name: text(i.name, 80), amount: text(i.amount, 40) })).filter((i) => i.name).slice(0, 40),
    }))
    .filter((g) => g.items.length > 0)
    .slice(0, 12);
  return { title: text(raw.title, 100), days, shopping, tips: raw.tips.map((t) => text(t, 300)).filter(Boolean).slice(0, 4) };
}

export function dayCalories(day: PlanDay): number {
  return day.meals.reduce((sum, m) => sum + m.calories, 0);
}

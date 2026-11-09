import type { FoodItem } from "../../shared/nutrition.ts";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export const MEAL_ICONS: Record<MealType, string> = {
  breakfast: "🍳",
  lunch: "🥗",
  dinner: "🍲",
  snack: "🍎",
};

/** Share of the daily calorie goal suggested for each meal (sums to 1). */
export const MEAL_SHARE: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
  snack: 0.1,
};

export function suggestedMealKcal(meal: MealType, dailyGoal: number): number {
  return Math.round((dailyGoal * MEAL_SHARE[meal]) / 10) * 10;
}

/** A food that has been logged to the diary. */
export interface LogEntry extends FoodItem {
  id: string;
  date: string; // local YYYY-MM-DD
  meal: MealType;
  loggedAt: number; // epoch ms
  updatedAt?: number; // epoch ms of the last change (for cloud sync); missing on older entries
  source: "scan" | "manual" | "quick";
  photo?: string; // small JPEG data URL thumbnail
  healthScore?: number; // 1–10 from the photo analysis (the whole meal's score), if scanned
}

/** Suggest a meal slot from the time of day. */
export function mealForTime(date = new Date()): MealType {
  const h = date.getHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

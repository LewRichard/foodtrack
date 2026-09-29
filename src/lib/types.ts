import type { FoodItem } from "../../shared/nutrition.ts";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

/** A food that has been logged to the diary. */
export interface LogEntry extends FoodItem {
  id: string;
  date: string; // local YYYY-MM-DD
  meal: MealType;
  loggedAt: number; // epoch ms
  source: "scan" | "manual" | "quick";
  photo?: string; // small JPEG data URL thumbnail
}

/** Suggest a meal slot from the time of day. */
export function mealForTime(date = new Date()): MealType {
  const h = date.getHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

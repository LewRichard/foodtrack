// What the weekly AI check-in is built from: a summary of each of the last 7 days.
// Only numbers and food names are sent — no photos, names or account details.

import { averageHealthScore, sumNutrients } from "../../shared/nutrition.ts";
import { addDays } from "./dates.ts";
import type { AppState } from "./store.ts";
import { series, weeklyRate } from "./weight.ts";

const round = (n: number, digits = 0) => Math.round(n * 10 ** digits) / 10 ** digits;

export function buildWeek(s: AppState, weekEnd: string) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekEnd, i - 6);
    const entries = s.entries.filter((e) => e.date === date);
    const total = sumNutrients(entries);
    return {
      date,
      kcal: round(total.calories),
      protein: round(total.protein),
      carbs: round(total.carbs),
      fat: round(total.fat),
      fiber: round(total.fiber),
      sugar: round(total.sugar),
      sodium: round(total.sodium),
      water: s.water[date] ?? 0,
      burned: s.burned[date] ?? 0,
      weight: s.weights[date] ?? null,
      healthScore: averageHealthScore(entries),
      meals: entries.slice(0, 40).map((e) => ({
        meal: e.meal,
        name: e.name.slice(0, 120),
        kcal: round(e.calories),
        healthScore: e.healthScore ?? null,
      })),
    };
  });
  const rate = weeklyRate(series(s.weights));
  return {
    days,
    goals: s.goals,
    goalType: s.profile?.goal ?? null,
    targetWeight: s.targetWeight,
    weightRatePerWeek: rate === null ? null : round(rate, 2),
  };
}

export type Week = ReturnType<typeof buildWeek>;

export function daysLogged(week: Week): number {
  return week.days.filter((d) => d.meals.length > 0).length;
}

// Shared nutrition types and math used by both the web client and the API server.

export interface Nutrients {
  calories: number; // kcal
  protein: number; // g
  carbs: number; // g
  fat: number; // g
  fiber: number; // g
  sugar: number; // g
  sodium: number; // mg
}

export const NUTRIENT_KEYS: (keyof Nutrients)[] = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "fiber",
  "sugar",
  "sodium",
];

export const EMPTY_NUTRIENTS: Nutrients = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sodium: 0,
};

/** A single food as recognised in a photo (or entered manually). */
export interface FoodItem extends Nutrients {
  name: string;
  portion: string; // human description, e.g. "1 cup" or "1 medium slice"
  grams: number; // estimated weight of the portion
  confidence: "high" | "medium" | "low";
}

/** Result returned by POST /api/analyze. */
export interface AnalysisResult {
  isFood: boolean;
  mealName: string;
  items: FoodItem[];
  notes: string;
  healthScore: number; // 1–10 for the whole meal (10 = very healthy)
  healthReason: string; // one short sentence explaining the score
}

/** Keeps a health score a whole number from 1 to 10 (or undefined when there isn't a valid one). */
export function clampHealthScore(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(10, Math.max(1, Math.round(n))) : undefined;
}

export type HealthTier = "great" | "good" | "fair" | "poor";

/** 9–10 great, 7–8 good, 5–6 fair, 1–4 poor. */
export function healthTier(score: number): HealthTier {
  return score >= 9 ? "great" : score >= 7 ? "good" : score >= 5 ? "fair" : "poor";
}

/** Calorie-weighted average score of the scored foods (a big fried dish counts more than a side salad). */
export function averageHealthScore(items: readonly { calories: number; healthScore?: number }[]): number | null {
  let weight = 0;
  let total = 0;
  for (const item of items) {
    if (!item.healthScore) continue;
    const w = Math.max(item.calories, 50);
    weight += w;
    total += item.healthScore * w;
  }
  return weight ? Math.round((total / weight) * 10) / 10 : null;
}

export function sumNutrients(items: readonly Nutrients[]): Nutrients {
  const total = { ...EMPTY_NUTRIENTS };
  for (const item of items) {
    for (const key of NUTRIENT_KEYS) total[key] += item[key] || 0;
  }
  return total;
}

/** Scale an item's nutrients by a serving multiplier (e.g. 1.5 servings). */
export function scaleItem<T extends Nutrients & { grams?: number }>(item: T, factor: number): T {
  const scaled = { ...item };
  for (const key of NUTRIENT_KEYS) scaled[key] = round(item[key] * factor, key === "calories" || key === "sodium" ? 0 : 1);
  if (typeof item.grams === "number") scaled.grams = round(item.grams * factor, 0);
  return scaled;
}

export function round(value: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

// ---- Goals ---------------------------------------------------------------

export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type GoalType = "lose" | "maintain" | "gain";

export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: GoalType;
}

export const ACTIVITY_FACTORS: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Mifflin-St Jeor basal metabolic rate, in kcal/day. */
export function bmr(p: Pick<Profile, "sex" | "age" | "heightCm" | "weightKg">): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === "male" ? base + 5 : base - 161;
}

/** Total daily energy expenditure. */
export function tdee(p: Profile): number {
  return bmr(p) * ACTIVITY_FACTORS[p.activity];
}

export interface Goals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export const DEFAULT_GOALS: Goals = {
  calories: 2000,
  protein: 120,
  carbs: 225,
  fat: 67,
  fiber: 28,
  sugar: 50,
  sodium: 2300,
};

/**
 * Suggested daily goals from a profile: ±500 kcal for lose/gain,
 * protein at 1.6–2.0 g/kg, fat at 28% of energy, carbs fill the rest.
 */
export function goalsFromProfile(p: Profile): Goals {
  const adjust = p.goal === "lose" ? -500 : p.goal === "gain" ? 300 : 0;
  const minimum = p.sex === "male" ? 1500 : 1200;
  const calories = Math.max(minimum, Math.round((tdee(p) + adjust) / 10) * 10);
  const protein = Math.round(p.weightKg * (p.goal === "maintain" ? 1.6 : 2.0));
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return {
    calories,
    protein,
    carbs,
    fat,
    fiber: Math.round((calories / 1000) * 14),
    sugar: Math.round((calories * 0.1) / 4),
    sodium: 2300,
  };
}

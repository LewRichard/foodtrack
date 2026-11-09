import { describe, expect, it } from "vitest";
import { averageHealthScore, clampHealthScore, healthTier } from "../shared/nutrition.ts";
import { ReportInputSchema } from "../server/report.ts";
import { buildWeek, daysLogged } from "../src/lib/report.ts";
import { INITIAL_STATE, type AppState } from "../src/lib/store.ts";
import type { LogEntry } from "../src/lib/types.ts";

const entry = (date: string, name: string, calories: number, healthScore?: number): LogEntry => ({
  id: `${date}-${name}`,
  date,
  meal: "lunch",
  name,
  portion: "1",
  grams: 300,
  calories,
  protein: 20,
  carbs: 50,
  fat: 15,
  fiber: 3,
  sugar: 5,
  sodium: 600,
  confidence: "high",
  source: healthScore ? "scan" : "manual",
  loggedAt: 1,
  healthScore,
});

describe("health score", () => {
  it("keeps scores whole numbers from 1 to 10", () => {
    expect(clampHealthScore(7.6)).toBe(8);
    expect(clampHealthScore(14)).toBe(10);
    expect(clampHealthScore(0)).toBeUndefined();
    expect(clampHealthScore("6")).toBe(6);
    expect(clampHealthScore("abc")).toBeUndefined();
  });

  it("puts scores into tiers", () => {
    expect([10, 9, 8, 7, 6, 5, 4, 1].map(healthTier)).toEqual(["great", "great", "good", "good", "fair", "fair", "poor", "poor"]);
  });

  it("averages by calories, ignoring unscored foods", () => {
    // A 900 kcal fried meal (3) outweighs a 300 kcal salad (9): (3*900 + 9*300) / 1200 = 4.5
    expect(averageHealthScore([{ calories: 900, healthScore: 3 }, { calories: 300, healthScore: 9 }, { calories: 500 }])).toBe(4.5);
    expect(averageHealthScore([{ calories: 500 }])).toBeNull();
  });
});

describe("weekly report data", () => {
  const state: AppState = {
    ...INITIAL_STATE,
    entries: [entry("2026-11-03", "Phở bò", 480, 8), entry("2026-11-05", "Gà rán", 900, 3), entry("2026-11-05", "Salad", 300, 9), entry("2026-10-01", "old", 100)],
    water: { "2026-11-05": 6 },
    weights: { "2026-11-03": 74.2, "2026-11-09": 73.8 },
    targetWeight: 70,
  };

  it("summarises the last 7 days, including days with nothing logged", () => {
    const week = buildWeek(state, "2026-11-09");
    expect(week.days.map((d) => d.date)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"]);
    expect(daysLogged(week)).toBe(2);
    const thu = week.days[2];
    expect(thu).toMatchObject({ kcal: 1200, water: 6, weight: null, healthScore: 4.5 });
    expect(thu.meals.map((m) => m.name)).toEqual(["Gà rán", "Salad"]);
    expect(week.days[6].weight).toBe(73.8);
    expect(week.targetWeight).toBe(70);
  });

  it("is accepted by the server's validation, and junk isn't", () => {
    expect(ReportInputSchema.safeParse(buildWeek(state, "2026-11-09")).success).toBe(true);
    expect(ReportInputSchema.safeParse({ days: [] }).success).toBe(false);
    const tooLong = buildWeek(state, "2026-11-09");
    tooLong.days[0].meals[0].name = "x".repeat(500);
    expect(ReportInputSchema.safeParse(tooLong).success).toBe(false);
  });
});

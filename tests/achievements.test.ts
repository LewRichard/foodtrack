import { describe, expect, it } from "vitest";
import { badges, newBadges, streak } from "../src/lib/achievements.ts";
import { addDays } from "../src/lib/dates.ts";
import { INITIAL_STATE, type AppState } from "../src/lib/store.ts";
import type { LogEntry } from "../src/lib/types.ts";

const TODAY = "2026-11-10";
let n = 0;
const meal = (date: string, extra: Partial<LogEntry> = {}): LogEntry => ({
  id: String(++n),
  date,
  meal: "lunch",
  name: "Cơm",
  portion: "1",
  grams: 300,
  calories: 600,
  protein: 30,
  carbs: 80,
  fat: 15,
  fiber: 3,
  sugar: 5,
  sodium: 500,
  confidence: "high",
  source: "manual",
  loggedAt: 1,
  ...extra,
});
const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => addDays(TODAY, -(from + i)));
const state = (s: Partial<AppState>): AppState => ({ ...INITIAL_STATE, ...s });
const get = (s: AppState, id: string) => badges(s, TODAY).find((b) => b.id === id)!;

describe("streak", () => {
  it("counts consecutive days up to today", () => {
    const s = state({ entries: days(0, 4).map((d) => meal(d)) });
    expect(streak(s, TODAY)).toEqual({ current: 5, longest: 5, loggedToday: true });
  });

  it("keeps the streak alive until today is over", () => {
    const s = state({ entries: days(1, 3).map((d) => meal(d)) }); // yesterday and the 2 days before
    expect(streak(s, TODAY)).toEqual({ current: 3, longest: 3, loggedToday: false });
  });

  it("resets after a missed day but remembers the longest", () => {
    const s = state({ entries: [...days(0, 1), ...days(3, 9)].map((d) => meal(d)) });
    expect(streak(s, TODAY)).toMatchObject({ current: 2, longest: 7 });
  });

  it("is zero for an empty diary", () => {
    expect(streak(state({}), TODAY)).toEqual({ current: 0, longest: 0, loggedToday: false });
  });
});

describe("badges", () => {
  it("awards first meal and streak badges, with progress for the rest", () => {
    const s = state({ entries: days(0, 4).map((d) => meal(d)) });
    expect(get(s, "first_meal").earned).toBe(true);
    expect(get(s, "streak_3").earned).toBe(true);
    expect(get(s, "streak_7")).toMatchObject({ earned: false, progress: 5, target: 7 });
  });

  it("checks calorie, protein, water and health goals per day", () => {
    const goals = { ...INITIAL_STATE.goals, calories: 2000, protein: 100 };
    const s = state({
      goals,
      entries: [
        meal(TODAY, { calories: 1950, protein: 110, healthScore: 9, source: "scan" }),
        meal(addDays(TODAY, -1), { calories: 3000, protein: 40, healthScore: 3, source: "scan" }),
      ],
      water: { [TODAY]: 8 },
    });
    expect(get(s, "on_target").earned).toBe(true);
    expect(get(s, "on_target_7").progress).toBe(1);
    expect(get(s, "protein_day").earned).toBe(true);
    expect(get(s, "water_day").earned).toBe(true);
    expect(get(s, "green_meal").earned).toBe(true);
    expect(get(s, "healthy_day").earned).toBe(true);
    expect(get(s, "first_scan").earned).toBe(true);
  });

  it("needs 7 days of enough water in a row", () => {
    const water = Object.fromEntries([...days(0, 5), ...days(7, 8)].map((d) => [d, 8]));
    expect(get(state({ water }), "water_7")).toMatchObject({ earned: false, progress: 6 });
    const all = Object.fromEntries(days(0, 6).map((d) => [d, 9]));
    expect(get(state({ water: all }), "water_7").earned).toBe(true);
  });

  it("tracks weigh-ins, weight lost and the goal weight", () => {
    const weights = { [addDays(TODAY, -30)]: 80, [addDays(TODAY, -10)]: 78.4, [TODAY]: 78.9 };
    const s = state({ weights, targetWeight: 79, profile: { sex: "male", age: 30, heightCm: 175, weightKg: 78.9, activity: "light", goal: "lose" } });
    expect(get(s, "first_weigh").earned).toBe(true);
    expect(get(s, "lost_1")).toMatchObject({ earned: true, progress: 1 }); // 1.6 kg at the lowest
    expect(get(s, "lost_5").progress).toBe(1.6);
    expect(get(s, "goal_weight").earned).toBe(true); // 78.9 ≤ 79
  });

  it("lists only badges this device hasn't celebrated", () => {
    const s = state({ entries: [meal(TODAY, { source: "scan" })] });
    expect(newBadges(badges(s, TODAY), ["first_meal"]).map((b) => b.id)).toEqual(["first_scan"]);
  });
});

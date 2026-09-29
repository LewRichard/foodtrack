import { describe, expect, it } from "vitest";
import { bmr, goalsFromProfile, scaleItem, sumNutrients, tdee, type FoodItem, type Profile } from "../shared/nutrition.ts";
import { addDays, toDateKey } from "../src/lib/dates.ts";
import { searchFoods } from "../src/lib/foods.ts";
import { entriesForDate, INITIAL_STATE, withEntries } from "../src/lib/store.ts";
import { mealForTime, type LogEntry } from "../src/lib/types.ts";

const apple: FoodItem = {
  name: "Apple",
  portion: "1 medium",
  grams: 182,
  calories: 95,
  protein: 0.5,
  carbs: 25,
  fat: 0.3,
  fiber: 4.4,
  sugar: 19,
  sodium: 2,
  confidence: "high",
};

const profile: Profile = { sex: "male", age: 30, heightCm: 180, weightKg: 80, activity: "moderate", goal: "maintain" };

function entry(overrides: Partial<LogEntry>): LogEntry {
  return { ...apple, id: "x", date: "2026-09-29", meal: "snack", loggedAt: 0, source: "manual", ...overrides };
}

describe("nutrition math", () => {
  it("sums nutrients", () => {
    const total = sumNutrients([apple, apple]);
    expect(total.calories).toBe(190);
    expect(total.carbs).toBe(50);
  });

  it("scales an item and its weight", () => {
    const half = scaleItem(apple, 0.5);
    expect(half.calories).toBe(48);
    expect(half.grams).toBe(91);
    expect(half.protein).toBe(0.3);
    expect(half.name).toBe("Apple");
  });

  it("computes Mifflin-St Jeor BMR and TDEE", () => {
    expect(bmr(profile)).toBe(1780);
    expect(bmr({ ...profile, sex: "female" })).toBe(1614);
    expect(tdee(profile)).toBeCloseTo(2759);
  });

  it("derives goals whose macros add up to the calorie target", () => {
    for (const goal of ["lose", "maintain", "gain"] as const) {
      const g = goalsFromProfile({ ...profile, goal });
      const macroKcal = g.protein * 4 + g.carbs * 4 + g.fat * 9;
      expect(Math.abs(macroKcal - g.calories)).toBeLessThan(15);
    }
    expect(goalsFromProfile({ ...profile, goal: "lose" }).calories).toBe(2260);
  });

  it("never suggests dangerously low calories", () => {
    const tiny: Profile = { sex: "female", age: 80, heightCm: 140, weightKg: 38, activity: "sedentary", goal: "lose" };
    expect(goalsFromProfile(tiny).calories).toBe(1200);
  });
});

describe("store reducers", () => {
  it("adds entries and tracks de-duplicated recents", () => {
    let s = withEntries(INITIAL_STATE, [entry({ id: "1" })]);
    s = withEntries(s, [entry({ id: "2", name: "Banana" }), entry({ id: "3", name: "apple" })]);
    expect(s.entries).toHaveLength(3);
    expect(s.recents.map((r) => r.name)).toEqual(["apple", "Banana"]);
    expect(s.recents[0]).not.toHaveProperty("id");
  });

  it("filters and sorts entries by date", () => {
    const s = withEntries(INITIAL_STATE, [
      entry({ id: "b", loggedAt: 2 }),
      entry({ id: "a", loggedAt: 1 }),
      entry({ id: "c", date: "2026-09-28" }),
    ]);
    expect(entriesForDate(s, "2026-09-29").map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("helpers", () => {
  it("uses local dates and crosses month boundaries", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("suggests a meal from the time of day", () => {
    expect(mealForTime(new Date(2026, 0, 1, 8))).toBe("breakfast");
    expect(mealForTime(new Date(2026, 0, 1, 12))).toBe("lunch");
    expect(mealForTime(new Date(2026, 0, 1, 19))).toBe("dinner");
    expect(mealForTime(new Date(2026, 0, 1, 16))).toBe("snack");
  });

  it("searches the food database by all words", () => {
    expect(searchFoods("rice brown").map((f) => f.name)).toEqual(["Brown rice, cooked"]);
    expect(searchFoods("")).toHaveLength(12);
  });
});

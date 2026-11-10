import { describe, expect, it } from "vitest";
import { cleanPlan, dayCalories, type MealPlan } from "../shared/mealplan.ts";
import { PlanRequestSchema } from "../server/mealplan.ts";

const meal = (over: Record<string, unknown> = {}) =>
  ({ meal: "lunch", name: "Cơm gà", portion: "1 đĩa", grams: 350, calories: 600.4, protein: 40.26, carbs: 70, fat: 15, fiber: 3, sugar: 4, sodium: 800, recipe: "x", ...over }) as MealPlan["days"][0]["meals"][0];

describe("cleanPlan", () => {
  it("keeps only the asked-for days, sorts meals and clamps numbers", () => {
    const raw: MealPlan = {
      title: "  Plan  ",
      days: [
        { meals: [meal({ meal: "dinner", name: "Phở" }), meal({ meal: "breakfast", calories: -50, protein: Number.NaN }), meal({ meal: "brunch" }), meal({ name: "  " })] },
        { meals: [meal()] },
      ],
      shopping: [
        { category: "Rau", items: [{ name: "Rau muống", amount: "2 bó" }, { name: "", amount: "1" }] },
        { category: "Empty", items: [] },
      ],
      tips: ["a", "", "b"],
    };
    const plan = cleanPlan(raw, 1);
    expect(plan.title).toBe("Plan");
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].meals.map((m) => m.meal)).toEqual(["breakfast", "dinner"]);
    expect(plan.days[0].meals[0]).toMatchObject({ calories: 0, protein: 0 });
    expect(plan.days[0].meals[1]).toMatchObject({ calories: 600, protein: 40.3 });
    expect(plan.shopping).toEqual([{ category: "Rau", items: [{ name: "Rau muống", amount: "2 bó" }] }]);
    expect(plan.tips).toEqual(["a", "b"]);
    expect(dayCalories(plan.days[0])).toBe(600);
  });
});

describe("PlanRequestSchema", () => {
  const body = {
    days: 3,
    preferences: "ăn chay",
    goals: { calories: 1900, protein: 120, carbs: 210, fat: 60, fiber: 28, sugar: 50, sodium: 2300 },
    profile: null,
    usualFoods: ["Phở bò"],
  };
  it("accepts 1, 3 or 7 days only", () => {
    expect(PlanRequestSchema.safeParse(body).success).toBe(true);
    expect(PlanRequestSchema.safeParse({ ...body, days: 7 }).success).toBe(true);
    expect(PlanRequestSchema.safeParse({ ...body, days: 30 }).success).toBe(false);
    expect(PlanRequestSchema.safeParse({ ...body, preferences: "x".repeat(401) }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { cleanMenu, MAX_DISHES, remainingFor, topPicks } from "../shared/menu.ts";

const dish = (menuName: string, extra: Record<string, unknown> = {}) => ({
  menuName,
  translated: "",
  price: "",
  portion: "1 plate",
  grams: 400,
  calories: 600,
  protein: 30,
  carbs: 60,
  fat: 20,
  fiber: 3,
  sugar: 5,
  sodium: 900,
  confidence: "medium",
  healthScore: 6,
  fit: "good",
  reason: "",
  tip: "",
  ...extra,
});

describe("cleanMenu", () => {
  it("cleans numbers, enums and duplicates", () => {
    const m = cleanMenu({
      isMenu: true,
      restaurant: " Phở 24 ",
      dishes: [
        dish("Phở bò", { calories: -5, protein: Number.NaN, fit: "amazing", healthScore: 14, confidence: "sure" }),
        dish("phở BÒ"),
        dish(""),
        dish("Bún chả", { translated: "Grilled pork with noodles" }),
        dish("Cơm tấm", { translated: "cơm tấm" }),
      ],
      advice: "Go for soups.",
    });
    expect(m.restaurant).toBe("Phở 24");
    expect(m.dishes.map((d) => d.menuName)).toEqual(["Phở bò", "Bún chả", "Cơm tấm"]);
    const pho = m.dishes[0];
    expect(pho.calories).toBe(0);
    expect(pho.protein).toBe(0);
    expect(pho.fit).toBe("ok");
    expect(pho.healthScore).toBe(10);
    expect(pho.confidence).toBe("medium");
    expect(m.dishes[1].name).toBe("Grilled pork with noodles");
    expect(m.dishes[2].translated).toBe(""); // same as the menu name
    expect(m.dishes[2].name).toBe("Cơm tấm");
  });

  it("is not a menu without dishes, and caps the count", () => {
    expect(cleanMenu({ isMenu: true, dishes: [] }).isMenu).toBe(false);
    expect(cleanMenu(null).isMenu).toBe(false);
    const many = cleanMenu({ isMenu: true, dishes: Array.from({ length: 60 }, (_, i) => dish(`Dish ${i}`)) });
    expect(many.dishes).toHaveLength(MAX_DISHES);
  });
});

describe("topPicks", () => {
  const menu = cleanMenu({
    isMenu: true,
    dishes: [
      dish("Fried chicken", { fit: "avoid", calories: 1200 }),
      dish("Big steak", { fit: "best", calories: 1100, healthScore: 7 }),
      dish("Salmon salad", { fit: "best", calories: 520, healthScore: 9 }),
      dish("Chicken soup", { fit: "best", calories: 450, healthScore: 8 }),
      dish("Pasta", { fit: "good", calories: 700 }),
    ],
  });

  it("puts best fits first, prefers dishes within what's left, never suggests avoid", () => {
    expect(topPicks(menu, 600).map((d) => d.menuName)).toEqual(["Salmon salad", "Chicken soup", "Big steak"]);
    expect(topPicks(menu, 600, 10).some((d) => d.fit === "avoid")).toBe(false);
  });
});

describe("remainingFor", () => {
  it("never goes below zero", () => {
    expect(remainingFor({ calories: 2000, protein: 100, carbs: 250, fat: 70 }, { calories: 2300, protein: 40, carbs: 100.4, fat: 70 })).toEqual({
      calories: 0,
      protein: 60,
      carbs: 150,
      fat: 0,
    });
  });
});

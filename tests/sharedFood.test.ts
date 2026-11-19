import { describe, expect, it } from "vitest";
import { cleanSharedFood, MAX_SHARED_ITEMS, shareFoodFrom } from "../shared/sharedFood.ts";

const item = (name: string, extra: Record<string, unknown> = {}) => ({ name, portion: "1 bowl", grams: 400, calories: 520, protein: 36, carbs: 62, fat: 11, fiber: 2, sugar: 4, sodium: 1200, confidence: "high", ...extra });

describe("cleanSharedFood", () => {
  it("keeps only safe, sane values from someone else's message", () => {
    const f = cleanSharedFood({
      title: "  Phở gà  ",
      items: [item("Phở gà", { calories: -10, protein: "x", confidence: "sure", extra: "<script>" }), item(""), { nonsense: true }],
      photo: "javascript:alert(1)",
      secret: "dropped",
    });
    expect(f).toEqual({ title: "Phở gà", items: [{ ...item("Phở gà"), calories: 0, protein: 0, confidence: "medium" }] });
  });

  it("accepts a small JPEG thumbnail and caps the number of items", () => {
    const photo = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const f = cleanSharedFood({ items: Array.from({ length: 40 }, (_, i) => item(`Food ${i}`)), photo });
    expect(f?.items).toHaveLength(MAX_SHARED_ITEMS);
    expect(f?.photo).toBe(photo);
    expect(f?.title).toBe("Food 0");
  });

  it("is null when nothing can be logged", () => {
    expect(cleanSharedFood(null)).toBeNull();
    expect(cleanSharedFood({ items: [] })).toBeNull();
    expect(cleanSharedFood("phở")).toBeNull();
  });

  it("never sends diary details along with the food", () => {
    const entry = { ...item("Cơm tấm"), id: "x", date: "2026-11-19", meal: "lunch", loggedAt: 1, source: "scan" };
    expect(Object.keys(shareFoodFrom("Lunch", [entry]).items[0]).sort()).toEqual(Object.keys(item("a")).sort());
  });
});

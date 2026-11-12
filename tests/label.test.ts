import { describe, expect, it } from "vitest";
import { cleanLabel, labelServing } from "../shared/label.ts";

describe("cleanLabel", () => {
  it("keeps printed values and cleans bad ones", () => {
    const l = cleanLabel({
      isLabel: true,
      productName: " Greek Yogurt ",
      servingSize: "1 cup (227g)",
      servingGrams: 227,
      servingsPerContainer: 4.04,
      calories: 150,
      protein: 20.04,
      carbs: 9,
      fat: -1,
      fiber: Number.NaN,
      sugar: 7,
      sodium: 75,
      notes: "",
    });
    expect(l).toMatchObject({ isLabel: true, productName: "Greek Yogurt", servingsPerContainer: 4, protein: 20, fat: 0, fiber: 0 });
  });

  it("is not a label when nothing could be read", () => {
    expect(cleanLabel({ isLabel: true, calories: 0, protein: 0, carbs: 0, fat: 0 }).isLabel).toBe(false);
    expect(cleanLabel(null).isLabel).toBe(false);
  });

  it("turns one serving into a diary item", () => {
    const item = labelServing(cleanLabel({ servingSize: "", calories: 200, protein: 5, carbs: 30, fat: 7 }), "Packaged food");
    expect(item).toMatchObject({ name: "Packaged food", portion: "1 serving", calories: 200, confidence: "high" });
  });
});

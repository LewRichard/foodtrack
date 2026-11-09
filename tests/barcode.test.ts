import { describe, expect, it, vi } from "vitest";
import { normalizeBarcode, productToFood } from "../shared/barcode.ts";
import { BarcodeLookup, BarcodeLookupError } from "../server/barcode.ts";

// Trimmed real-shaped Open Food Facts product (a hazelnut spread, 15 g serving).
const spread = {
  product_name: "Nutella",
  product_name_vi: "Kem phết Nutella",
  brands: "Ferrero,Nutella",
  serving_size: "15 g",
  serving_quantity: 15,
  nutriments: {
    "energy-kcal_100g": 539,
    proteins_100g: 6.3,
    carbohydrates_100g: 57.5,
    fat_100g: 30.9,
    sugars_100g: 56.3,
    fiber_100g: 0,
    salt_100g: 0.107,
  },
};

describe("barcodes", () => {
  it("accepts 8–14 digit codes, ignoring spaces and dashes", () => {
    expect(normalizeBarcode(" 3017 6240-10701 ")).toBe("3017624010701");
    expect(normalizeBarcode("12345")).toBeNull();
    expect(normalizeBarcode("abc12345678")).toBeNull();
  });

  it("converts a product to one serving", () => {
    const { food, per, incomplete } = productToFood("3017624010701", spread, "en");
    expect(per).toBe("serving");
    expect(incomplete).toBe(false);
    expect(food).toMatchObject({ name: "Nutella (Ferrero)", portion: "15 g", grams: 15, calories: 81, protein: 0.9, fat: 4.6, sugar: 8.4, confidence: "high" });
    expect(food.sodium).toBe(6); // 0.107 g salt / 100 g → 42.8 mg sodium / 100 g → 6 mg per 15 g
  });

  it("uses the name in the person's language when there is one", () => {
    expect(productToFood("1", spread, "vi").food.name).toBe("Kem phết Nutella (Ferrero)");
  });

  it("falls back to 100 g, and to kJ, when that's all the package says", () => {
    const { food, per } = productToFood("1", { product_name: "Oat drink", nutriments: { energy_100g: 200 } }, "en");
    expect(per).toBe("100g");
    expect(food).toMatchObject({ portion: "100 g", grams: 100, calories: 48 });
  });

  it("flags products without calories so the person fills them in", () => {
    const result = productToFood("1", { product_name: "Mystery snack" }, "en");
    expect(result.incomplete).toBe(true);
    expect(result.food.confidence).toBe("low");
  });
});

describe("barcode lookup", () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it("finds a product and caches it", async () => {
    const fetchMock = vi.fn(async () => json(200, { status: 1, product: spread }));
    const lookup = new BarcodeLookup(fetchMock as unknown as typeof fetch);
    const first = await lookup.find("3017624010701", "en");
    const second = await lookup.find("3017624010701", "en");
    expect(first?.food.calories).toBe(81);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("/3017624010701.json?fields=");
  });

  it("returns null for unknown products (404 or status 0)", async () => {
    expect(await new BarcodeLookup((async () => json(404, { status: 0 })) as unknown as typeof fetch).find("12345678", "en")).toBeNull();
    expect(await new BarcodeLookup((async () => json(200, { status: 0 })) as unknown as typeof fetch).find("12345678", "en")).toBeNull();
  });

  it("reports when Open Food Facts can't be reached, without caching it", async () => {
    let calls = 0;
    const lookup = new BarcodeLookup((async () => {
      calls++;
      if (calls === 1) throw new TypeError("fetch failed");
      return json(503, {});
    }) as unknown as typeof fetch);
    await expect(lookup.find("12345678", "en")).rejects.toBeInstanceOf(BarcodeLookupError);
    await expect(lookup.find("12345678", "en")).rejects.toBeInstanceOf(BarcodeLookupError);
    expect(calls).toBe(2);
  });
});

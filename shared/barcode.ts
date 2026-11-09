import type { FoodItem } from "./nutrition.ts";

// Packaged-food lookup by barcode, using Open Food Facts (free, open data: openfoodfacts.org).

/** Product barcodes (EAN-8, UPC-A, EAN-13, GTIN-14) are 8–14 digits. */
export function normalizeBarcode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, "");
  return /^\d{8,14}$/.test(code) ? code : null;
}

export interface BarcodeProduct {
  code: string;
  food: FoodItem;
  /** "serving" when the package lists a serving size, else values are per 100 g/ml. */
  per: "serving" | "100g";
  /** True when the database has no calorie figure; the person should copy it from the label. */
  incomplete: boolean;
}

/** The fields we ask Open Food Facts for (keeps responses small). */
export function offFields(lang: string): string {
  return ["product_name", `product_name_${lang}`, "generic_name", "brands", "serving_size", "serving_quantity", "nutriments"].join(",");
}

type Nutriments = Record<string, unknown>;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Per-100 g values from Open Food Facts' nutriments, converting units we store differently. */
function per100(n: Nutriments) {
  const kcal = num(n["energy-kcal_100g"]) ?? (num(n["energy_100g"]) !== null ? num(n["energy_100g"])! / 4.184 : null);
  const sodiumG = num(n["sodium_100g"]) ?? (num(n["salt_100g"]) !== null ? num(n["salt_100g"])! / 2.5 : null);
  return {
    calories: kcal,
    protein: num(n["proteins_100g"]),
    carbs: num(n["carbohydrates_100g"]),
    fat: num(n["fat_100g"]),
    fiber: num(n["fiber_100g"]),
    sugar: num(n["sugars_100g"]),
    sodium: sodiumG === null ? null : sodiumG * 1000, // g → mg
  };
}

/** Turns an Open Food Facts product into a diary item, per serving when the package gives one. */
export function productToFood(code: string, product: Record<string, unknown>, lang: string): BarcodeProduct {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const baseName = text(product[`product_name_${lang}`]) || text(product.product_name) || text(product.generic_name);
  const brand = text(product.brands).split(",")[0]?.trim() ?? "";
  const name =
    baseName && brand && !baseName.toLowerCase().includes(brand.toLowerCase())
      ? `${baseName} (${brand})`
      : baseName || brand || code;

  const values = per100((product.nutriments ?? {}) as Nutriments);
  const servingQty = num(product.serving_quantity);
  const servingText = text(product.serving_size);
  const useServing = servingQty !== null && servingQty > 0 && servingQty <= 2000;
  const grams = useServing ? servingQty : 100;
  const scale = grams / 100;
  const v = (x: number | null) => round1((x ?? 0) * scale);

  return {
    code,
    per: useServing ? "serving" : "100g",
    incomplete: values.calories === null,
    food: {
      name,
      portion: useServing ? servingText || `${grams} g` : "100 g",
      grams,
      calories: Math.round((values.calories ?? 0) * scale),
      protein: v(values.protein),
      carbs: v(values.carbs),
      fat: v(values.fat),
      fiber: v(values.fiber),
      sugar: v(values.sugar),
      sodium: Math.round((values.sodium ?? 0) * scale),
      confidence: values.calories === null ? "low" : "high",
    },
  };
}

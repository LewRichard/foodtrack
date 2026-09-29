import type { FoodItem } from "../../shared/nutrition.ts";

// A small offline database of common foods (approximate USDA values per serving)
// for quick manual logging without a photo.
type Row = [name: string, portion: string, grams: number, kcal: number, protein: number, carbs: number, fat: number, fiber: number, sugar: number, sodium: number];

const ROWS: Row[] = [
  ["Apple", "1 medium", 182, 95, 0.5, 25, 0.3, 4.4, 19, 2],
  ["Banana", "1 medium", 118, 105, 1.3, 27, 0.4, 3.1, 14, 1],
  ["Orange", "1 medium", 131, 62, 1.2, 15.4, 0.2, 3.1, 12.2, 0],
  ["Strawberries", "1 cup", 152, 49, 1, 11.7, 0.5, 3, 7.4, 2],
  ["Blueberries", "1 cup", 148, 84, 1.1, 21.4, 0.5, 3.6, 14.7, 1],
  ["Avocado", "1/2 fruit", 100, 160, 2, 8.5, 14.7, 6.7, 0.7, 7],
  ["Egg, boiled", "1 large", 50, 78, 6.3, 0.6, 5.3, 0, 0.6, 62],
  ["Scrambled eggs", "2 eggs", 122, 182, 12.2, 2, 13.4, 0, 1.7, 342],
  ["Oatmeal, cooked", "1 cup", 234, 166, 5.9, 28, 3.6, 4, 0.6, 9],
  ["Greek yogurt, plain nonfat", "170 g cup", 170, 100, 17.3, 6.1, 0.7, 0, 5.5, 61],
  ["Milk, 2%", "1 cup", 244, 122, 8.1, 11.7, 4.8, 0, 12.3, 115],
  ["Whole wheat bread", "1 slice", 32, 81, 4, 13.8, 1.1, 1.9, 1.4, 146],
  ["White bread", "1 slice", 29, 77, 2.6, 14.3, 1, 0.7, 1.6, 142],
  ["Bagel, plain", "1 medium", 105, 277, 11, 55, 1.4, 2.4, 5.5, 443],
  ["Peanut butter", "2 tbsp", 32, 188, 8, 6.9, 16.1, 1.9, 3.4, 147],
  ["Butter", "1 tbsp", 14, 102, 0.1, 0, 11.5, 0, 0, 91],
  ["Olive oil", "1 tbsp", 13.5, 119, 0, 0, 13.5, 0, 0, 0],
  ["White rice, cooked", "1 cup", 158, 205, 4.3, 44.5, 0.4, 0.6, 0.1, 2],
  ["Brown rice, cooked", "1 cup", 195, 218, 4.5, 45.8, 1.6, 3.5, 0.7, 2],
  ["Pasta, cooked", "1 cup", 140, 221, 8.1, 43.2, 1.3, 2.5, 0.8, 1],
  ["Quinoa, cooked", "1 cup", 185, 222, 8.1, 39.4, 3.6, 5.2, 1.6, 13],
  ["Potato, baked", "1 medium", 173, 161, 4.3, 36.6, 0.2, 3.8, 2, 17],
  ["French fries", "medium serving", 117, 365, 4, 48, 17, 4.4, 0.3, 246],
  ["Chicken breast, grilled", "100 g", 100, 165, 31, 0, 3.6, 0, 0, 74],
  ["Salmon, baked", "100 g", 100, 206, 22.1, 0, 12.4, 0, 0, 61],
  ["Tuna, canned in water", "1 can drained", 142, 179, 39.4, 0, 1.3, 0, 0, 525],
  ["Beef steak, sirloin", "100 g", 100, 244, 27, 0, 14.2, 0, 0, 56],
  ["Ground beef 85%, cooked", "100 g", 100, 250, 25.9, 0, 15.4, 0, 0, 72],
  ["Tofu, firm", "100 g", 100, 144, 17.3, 2.8, 8.7, 2.3, 0.6, 14],
  ["Black beans, cooked", "1 cup", 172, 227, 15.2, 40.8, 0.9, 15, 0.6, 2],
  ["Lentils, cooked", "1 cup", 198, 230, 17.9, 39.9, 0.8, 15.6, 3.6, 4],
  ["Broccoli, steamed", "1 cup", 156, 55, 3.7, 11.2, 0.6, 5.1, 2.2, 64],
  ["Mixed green salad", "2 cups", 85, 15, 1.2, 2.9, 0.2, 1.8, 1, 24],
  ["Caesar salad", "1 bowl", 200, 360, 9, 14, 30, 3, 3, 700],
  ["Cheddar cheese", "1 oz", 28, 114, 7, 0.4, 9.4, 0, 0.1, 176],
  ["Almonds", "1 oz (23 nuts)", 28, 164, 6, 6.1, 14.2, 3.5, 1.2, 0],
  ["Pizza, cheese", "1 slice", 107, 285, 12.2, 35.7, 10.4, 2.5, 3.8, 640],
  ["Hamburger", "1 burger", 226, 540, 34, 40, 27, 2, 9, 790],
  ["Burrito, chicken", "1 burrito", 340, 690, 38, 71, 26, 9, 4, 1650],
  ["Sushi, salmon roll", "6 pieces", 170, 290, 12, 42, 7, 2, 7, 520],
  ["Chocolate chip cookie", "1 medium", 30, 148, 1.5, 19, 7.4, 0.8, 10, 99],
  ["Dark chocolate 70%", "1 oz", 28, 170, 2.2, 13, 12, 3.1, 6.8, 6],
  ["Coffee, black", "1 cup", 240, 2, 0.3, 0, 0, 0, 0, 5],
  ["Latte, whole milk", "16 oz", 473, 220, 12, 18, 11, 0, 17, 170],
  ["Orange juice", "1 cup", 248, 112, 1.7, 25.8, 0.5, 0.5, 20.8, 2],
  ["Cola", "12 oz can", 355, 140, 0, 39, 0, 0, 39, 45],
  ["Beer", "12 oz", 356, 153, 1.6, 12.6, 0, 0, 0, 14],
  ["Red wine", "5 oz glass", 148, 125, 0.1, 3.8, 0, 0, 0.9, 6],
  ["Protein shake (whey)", "1 scoop in water", 30, 120, 24, 3, 1.5, 0, 1, 130],
];

export const FOODS: FoodItem[] = ROWS.map(([name, portion, grams, calories, protein, carbs, fat, fiber, sugar, sodium]) => ({
  name,
  portion,
  grams,
  calories,
  protein,
  carbs,
  fat,
  fiber,
  sugar,
  sodium,
  confidence: "high",
}));

export function searchFoods(query: string, limit = 12): FoodItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return FOODS.slice(0, limit);
  const words = q.split(/\s+/);
  return FOODS.filter((f) => words.every((w) => f.name.toLowerCase().includes(w))).slice(0, limit);
}

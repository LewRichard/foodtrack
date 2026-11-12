// Reading a restaurant menu from photos: every dish with estimated nutrition, ranked against
// what the person has left to eat today.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { AI_LANGUAGE_NAMES, type Lang } from "../shared/languages.ts";
import { cleanMenu, MAX_DISHES, MAX_MENU_PHOTOS, type MenuContext, type MenuResult } from "../shared/menu.ts";
import { AnalysisError, fallbackFor, SCAN_MODEL, type ImageMediaType, type ModelChoice } from "./analyze.ts";

const n = z.number().finite();

export const MenuContextSchema = z.object({
  remaining: z.object({ calories: n, protein: n, carbs: n, fat: n }),
  goal: z.enum(["lose", "maintain", "gain"]).nullable(),
  preferences: z.string().max(200),
});

const DishSchema = z.object({
  menuName: z.string().describe("The dish name exactly as printed on the menu"),
  translated: z.string().describe("The name in the reply language if the menu uses another language, otherwise an empty string"),
  price: z.string().describe("Price as printed (with currency), or empty string"),
  portion: z.string().describe("Typical serving at a restaurant, in household units, e.g. '1 plate', '1 large bowl'"),
  grams: z.number().describe("Estimated weight of that serving in grams"),
  calories: z.number().describe("kcal for the serving"),
  protein: z.number().describe("grams"),
  carbs: z.number().describe("grams"),
  fat: z.number().describe("grams"),
  fiber: z.number().describe("grams"),
  sugar: z.number().describe("grams"),
  sodium: z.number().describe("milligrams"),
  confidence: z.enum(["high", "medium", "low"]),
  healthScore: z.number().describe("Whole number 1–10, how healthy the dish is"),
  fit: z.enum(["best", "good", "ok", "avoid"]).describe("How well it fits this person right now"),
  reason: z.string().describe("One short sentence on why (calories vs what's left, protein, how it's cooked)"),
  tip: z.string().describe("One easy way to order it lighter or more filling, or empty string"),
});

const MenuSchema = z.object({
  isMenu: z.boolean().describe("false if the photos don't show a food or drink menu"),
  restaurant: z.string().describe("Restaurant name if visible, otherwise empty string"),
  dishes: z.array(DishSchema),
  advice: z.string().describe("One or two friendly sentences on what to order here"),
});

const SYSTEM_PROMPT = `You are a dietitian helping someone order at a restaurant. They photographed the menu (one or more pages).

Read every food and drink dish on the menu (at most ${MAX_DISHES}; if there are more, keep the mains and the ones most worth comparing, and skip near-duplicates like sizes of the same drink). For each dish:
- Estimate nutrition for one normal restaurant serving of that dish as it is usually made there, including cooking oil, sauces, rice or bread that comes with it. Use the menu description when there is one. Restaurant portions are often larger and oilier than home cooking. Numbers must add up: calories ≈ 4×protein + 4×carbs + 9×fat.
- Give a health score from 1 (deep-fried, ultra-processed, very sugary) to 10 (whole foods, vegetables, lean protein, light cooking).
- Judge the fit for this person now, from the calories and macros they have left today, their goal and preferences:
  - best: comfortably within what's left, good protein and vegetables, matches the goal. Mark about 3 dishes as best.
  - good: fits with a small compromise.
  - ok: possible but heavy for what's left, or low in protein.
  - avoid: far over what's left, or clashes with their preferences (allergy, diet).
- Never mark a dish best or good if it breaks their stated preferences.
- Keep reasons short and kind, and give a practical tip when one helps (sauce on the side, half rice, swap fries for salad, share it).

If the photos aren't a menu, set isMenu to false and return no dishes.`;

const client = new Anthropic();

export interface MenuPhoto {
  image: string; // base64
  mediaType: ImageMediaType;
}

function describeContext(c: MenuContext): string {
  const r = c.remaining;
  const lines = [
    `Left for today: ${Math.round(r.calories)} kcal, ${Math.round(r.protein)} g protein, ${Math.round(r.carbs)} g carbs, ${Math.round(r.fat)} g fat.`,
  ];
  if (c.goal) lines.push(`Goal: ${c.goal === "lose" ? "lose weight" : c.goal === "gain" ? "gain weight / muscle" : "maintain weight"}.`);
  if (c.preferences.trim()) lines.push(`Their preferences: <preferences>${c.preferences.trim()}</preferences>`);
  return lines.join("\n");
}

export async function analyzeMenu(photos: MenuPhoto[], context: MenuContext, language: Lang = "en", choice: ModelChoice = {}): Promise<MenuResult> {
  const model = choice.model ?? SCAN_MODEL;
  const languageNote =
    language === "en"
      ? " Write translated names, portions, reasons, tips and advice in English."
      : ` Write translated names, portions, reasons, tips and advice in ${AI_LANGUAGE_NAMES[language]}; keep menuName exactly as printed.`;
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: choice.effort ?? "medium", format: betaZodOutputFormat(MenuSchema) },
    ...fallbackFor(model),
    messages: [
      {
        role: "user",
        content: [
          ...photos.slice(0, MAX_MENU_PHOTOS).map((p) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: p.mediaType, data: p.image },
          })),
          { type: "text", text: `${describeContext(context)}\n\nWhat should I order?${languageNote}` },
        ],
      },
    ],
  });
  choice.onUsage?.(response.usage, model);

  if (response.stop_reason === "refusal") {
    throw new AnalysisError("The model declined to read this menu.", 422, "ai_refused");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new AnalysisError("Could not read the menu from the model response.", 502, "ai_unreadable");
  }
  return cleanMenu(response.parsed_output);
}

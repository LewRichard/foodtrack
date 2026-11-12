import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { AI_LANGUAGE_NAMES, type Lang } from "../shared/languages.ts";
import { clampHealthScore, type AnalysisResult } from "../shared/nutrition.ts";

export const MODEL = "claude-opus-5-5";

/**
 * The model for photo and text logging, the most frequent AI calls. Set SCAN_MODEL (e.g.
 * "claude-haiku-5-5") to use a cheaper model there; Lew, meal plans and reports keep MODEL.
 */
export const SCAN_MODEL = (process.env.SCAN_MODEL ?? "").trim() || MODEL;

export type Effort = "low" | "medium" | "high";

export interface ModelChoice {
  model?: string;
  effort?: Effort;
  /** Called with the token counts of each request (for the model comparison script). */
  onUsage?: (usage: { input_tokens: number; output_tokens: number }, model: string) => void;
}

/** Server-side refusal fallback, on the models that offer it (not Haiku). */
export function fallbackFor(model: string): { betas?: Anthropic.Beta.AnthropicBeta[]; fallbacks?: "default" } {
  return model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
}

const FoodItemSchema = z.object({
  name: z.string().describe("Short food name, e.g. 'Grilled chicken breast'"),
  portion: z.string().describe("Visible portion in household units, e.g. '1 cup', '2 slices'"),
  grams: z.number().describe("Estimated weight of the portion in grams"),
  calories: z.number().describe("kcal for the portion"),
  protein: z.number().describe("grams"),
  carbs: z.number().describe("grams"),
  fat: z.number().describe("grams"),
  fiber: z.number().describe("grams"),
  sugar: z.number().describe("grams"),
  sodium: z.number().describe("milligrams"),
  confidence: z.enum(["high", "medium", "low"]),
});

export const AnalysisSchema = z.object({
  isFood: z.boolean().describe("false if the photo does not show food or drink"),
  mealName: z.string().describe("A short title for the whole plate/meal"),
  items: z.array(FoodItemSchema),
  notes: z.string().describe("One or two sentences on assumptions (hidden oils, sauces, portion uncertainty)"),
  healthScore: z.number().describe("Whole number from 1 to 10 rating how healthy the whole meal is (see rubric); 0 if isFood is false"),
  healthReason: z.string().describe("One short, friendly sentence explaining the score, naming what helped or hurt it"),
});

const HEALTH_RUBRIC = `Also give the whole meal a health score from 1 to 10:
- 9–10: mostly whole foods, plenty of vegetables or fruit, lean protein or legumes, whole grains; steamed, boiled, grilled or raw; little added fat, sugar or salt (e.g. grilled fish with vegetables and brown rice, a fresh salad with eggs, fruit with plain yoghurt).
- 7–8: balanced with some refined carbs or a moderate amount of oil, sauce or salt (e.g. phở with herbs, chicken rice with vegetables, a turkey sandwich on wholemeal).
- 5–6: average: large refined-carb portions, few vegetables, noticeable oil or sugar (e.g. fried rice, a white-bread sandwich with processed meat, sweetened milk tea).
- 3–4: fried or oily, heavily processed, very salty or sugary (e.g. fried chicken with fries, instant noodles, pastries, a large bubble tea).
- 1–2: mostly deep-fried or ultra-processed food together with sugary drinks or desserts, little nutritional value.
Judge the cooking method, oil, vegetables, portion size and drinks. Be fair and encouraging in healthReason, and mention one easy improvement when the score is below 8.`;

const SYSTEM_PROMPT = `You are a registered dietitian estimating the nutrition of food from photos for a calorie-tracking app.

For each photo:
- Identify every distinct food and drink that is visible. Split mixed plates into components (e.g. rice, curry, naan) unless a dish is normally logged as one item (e.g. a burrito).
- Estimate each portion's weight in grams using visual cues: plate/bowl size, utensils, hands, packaging. Describe the portion in household units.
- Estimate calories and nutrients for the portion as served, using standard reference values (USDA FoodData Central style). Account for likely cooking oil, butter, dressings and sauces.
- If a nutrition label or packaging is visible, prefer its values.
- If the user adds a note (e.g. "half eaten", "no sugar"), apply it.
- Set confidence to "low" when the food is ambiguous or largely hidden.
- If the image shows no food or drink, set isFood to false and return an empty items list.

Numbers must be for the whole visible portion, not per 100 g. Round calories and sodium to whole numbers and macros to one decimal.

${HEALTH_RUBRIC}`;

const client = new Anthropic();

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export class AnalysisError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly code = "ai_error",
  ) {
    super(message);
  }
}

export async function analyzeFoodImage(
  imageBase64: string,
  mediaType: ImageMediaType,
  note?: string,
  language: Lang = "en",
  choice: ModelChoice = {},
): Promise<AnalysisResult> {
  const model = choice.model ?? SCAN_MODEL;
  // Food names, portions, meal name and notes come back in the app's language; JSON keys stay English.
  const languageNote =
    language === "en"
      ? ""
      : ` Write mealName, each item's name and portion, notes and healthReason in ${AI_LANGUAGE_NAMES[language]}, using the names people there usually call these foods.`;
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: choice.effort ?? "medium", format: betaZodOutputFormat(AnalysisSchema) },
    // If the primary model declines, the API retries on a suitable fallback model.
    ...fallbackFor(model),
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          {
            type: "text",
            text: note?.trim()
              ? `Estimate the nutrition of this meal.${languageNote} User note: ${note.trim()}`
              : `Estimate the nutrition of this meal.${languageNote}`,
          },
        ],
      },
    ],
  });
  choice.onUsage?.(response.usage, model);

  if (response.stop_reason === "refusal") {
    throw new AnalysisError("The model declined to analyze this image.", 422, "ai_refused");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new AnalysisError("Could not read a nutrition estimate from the model response.", 502, "ai_unreadable");
  }
  const result = response.parsed_output;
  return { ...result, healthScore: result.isFood ? (clampHealthScore(result.healthScore) ?? 5) : 0 };
}

// ---- From a description ("trưa nay ăn 1 tô bún bò với ly trà đá") ---------------------------------

export const TextAnalysisSchema = AnalysisSchema.extend({
  isFood: z.boolean().describe("false if the text doesn't describe anything eaten or drunk"),
  meal: z
    .enum(["breakfast", "lunch", "dinner", "snack", "unknown"])
    .describe("The meal the text names (e.g. 'this morning' = breakfast, 'trưa' = lunch); unknown if it doesn't say"),
});

const TEXT_PROMPT = `You are a registered dietitian turning a short description of what someone ate into diary entries for a calorie-tracking app. The text may be typed or dictated, in any language, with typos or missing accents.

- List every food and drink mentioned as its own item. Keep a dish that is normally logged as one item together (e.g. "bún bò", "a burrito"); split separate things ("rice and fried egg" → two items).
- Use the amounts given ("2 bowls", "half a pizza", "a large milk tea"); otherwise assume one typical portion for that food where it is usually eaten. Describe the portion in household units and estimate grams.
- Estimate calories and nutrients for each portion with standard reference values, including typical cooking oil, sauces and sugar for how the dish is usually made (e.g. Vietnamese iced coffee with condensed milk, trà đá as unsweetened tea).
- Set confidence to "low" when the description is vague (e.g. "some snacks").
- mealName is a short title for everything listed. notes says, in one or two sentences, what you assumed about portions or preparation.
- If the text isn't about food or drink they had, set isFood to false and return no items.

Numbers are for the whole portion, not per 100 g. Round calories and sodium to whole numbers and macros to one decimal.

${HEALTH_RUBRIC}`;

export type TextAnalysis = AnalysisResult & { meal: "breakfast" | "lunch" | "dinner" | "snack" | null };

export async function analyzeFoodText(text: string, language: Lang = "en", choice: ModelChoice = {}): Promise<TextAnalysis> {
  const model = choice.model ?? SCAN_MODEL;
  const languageNote =
    language === "en"
      ? ""
      : ` Write mealName, each item's name and portion, notes and healthReason in ${AI_LANGUAGE_NAMES[language]}, using the names people there usually call these foods.`;
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    system: TEXT_PROMPT,
    output_config: { effort: choice.effort ?? "low", format: betaZodOutputFormat(TextAnalysisSchema) },
    ...fallbackFor(model),
    messages: [{ role: "user", content: `What I ate:${languageNote}\n\n<description>\n${text.trim()}\n</description>` }],
  });
  choice.onUsage?.(response.usage, model);

  if (response.stop_reason === "refusal") {
    throw new AnalysisError("The model declined to read this description.", 422, "ai_refused");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new AnalysisError("Could not read a nutrition estimate from the model response.", 502, "ai_unreadable");
  }
  const { meal, ...result } = response.parsed_output;
  return {
    ...result,
    items: result.isFood ? result.items : [],
    healthScore: result.isFood ? (clampHealthScore(result.healthScore) ?? 5) : 0,
    meal: meal === "unknown" ? null : meal,
  };
}

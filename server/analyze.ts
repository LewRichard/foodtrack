import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import type { AnalysisResult } from "../shared/nutrition.ts";

export const MODEL = "claude-opus-5-5";

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
});

const SYSTEM_PROMPT = `You are a registered dietitian estimating the nutrition of food from photos for a calorie-tracking app.

For each photo:
- Identify every distinct food and drink that is visible. Split mixed plates into components (e.g. rice, curry, naan) unless a dish is normally logged as one item (e.g. a burrito).
- Estimate each portion's weight in grams using visual cues: plate/bowl size, utensils, hands, packaging. Describe the portion in household units.
- Estimate calories and nutrients for the portion as served, using standard reference values (USDA FoodData Central style). Account for likely cooking oil, butter, dressings and sauces.
- If a nutrition label or packaging is visible, prefer its values.
- If the user adds a note (e.g. "half eaten", "no sugar"), apply it.
- Set confidence to "low" when the food is ambiguous or largely hidden.
- If the image shows no food or drink, set isFood to false and return an empty items list.

Numbers must be for the whole visible portion, not per 100 g. Round calories and sodium to whole numbers and macros to one decimal.`;

const client = new Anthropic();

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export class AnalysisError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

export async function analyzeFoodImage(
  imageBase64: string,
  mediaType: ImageMediaType,
  note?: string,
): Promise<AnalysisResult> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium", format: betaZodOutputFormat(AnalysisSchema) },
    // If the primary model declines, the API retries on a suitable fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          {
            type: "text",
            text: note?.trim()
              ? `Estimate the nutrition of this meal. User note: ${note.trim()}`
              : "Estimate the nutrition of this meal.",
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new AnalysisError("The model declined to analyze this image.", 422);
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new AnalysisError("Could not read a nutrition estimate from the model response.", 502);
  }
  return response.parsed_output;
}

// Reading a Nutrition Facts label from a photo: the values for one serving, as printed.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { AI_LANGUAGE_NAMES, type Lang } from "../shared/languages.ts";
import { cleanLabel, type LabelResult } from "../shared/label.ts";
import { AnalysisError, fallbackFor, SCAN_MODEL, type ImageMediaType, type ModelChoice } from "./analyze.ts";

const LabelSchema = z.object({
  isLabel: z.boolean().describe("false if the photo doesn't show a nutrition label or the numbers can't be read"),
  productName: z.string().describe("Product name if visible on the package, otherwise empty string"),
  servingSize: z.string().describe("Serving size as printed, e.g. '2/3 cup (55g)' or '100 g'"),
  servingGrams: z.number().describe("Grams (or ml) in one serving; 0 if not printed"),
  servingsPerContainer: z.number().describe("Servings per container; 0 if not printed"),
  calories: z.number().describe("kcal per serving"),
  protein: z.number().describe("grams per serving"),
  carbs: z.number().describe("total carbohydrate, grams per serving"),
  fat: z.number().describe("total fat, grams per serving"),
  fiber: z.number().describe("grams per serving; 0 if not printed"),
  sugar: z.number().describe("total sugars, grams per serving; 0 if not printed"),
  sodium: z.number().describe("milligrams per serving"),
  notes: z.string().describe("One short sentence on anything uncertain or converted (e.g. from kJ or salt), or empty string"),
});

const SYSTEM_PROMPT = `You read nutrition labels (Nutrition Facts, EU nutrition declarations, Asian labels) from photos for a calorie-tracking app.

- Copy the numbers exactly as printed; do not estimate from the product type.
- Report values for one serving. If the label gives only per 100 g / 100 ml, report per 100 g or ml with servingSize "100 g" (or "100 ml") and servingGrams 100. If it gives both, use the per-serving column.
- If energy is only in kJ, convert to kcal (divide by 4.184). If only salt is given, sodium mg = salt g × 400. Say so in notes.
- If part of the label is cut off or blurry, fill in what you can read, use 0 for what you can't, and mention it in notes.
- If there's no readable nutrition label, set isLabel to false.`;

const client = new Anthropic();

export async function analyzeLabel(image: string, mediaType: ImageMediaType, language: Lang = "en", choice: ModelChoice = {}): Promise<LabelResult> {
  const model = choice.model ?? SCAN_MODEL;
  const languageNote =
    language === "en" ? "" : ` Write notes in ${AI_LANGUAGE_NAMES[language]}; keep productName and servingSize as printed.`;
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: choice.effort ?? "low", format: betaZodOutputFormat(LabelSchema) },
    ...fallbackFor(model),
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text: `Read this nutrition label.${languageNote}` },
        ],
      },
    ],
  });
  choice.onUsage?.(response.usage, model);

  if (response.stop_reason === "refusal") {
    throw new AnalysisError("The model declined to read this label.", 422, "ai_refused");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new AnalysisError("Could not read the label from the model response.", 502, "ai_unreadable");
  }
  return cleanLabel(response.parsed_output);
}

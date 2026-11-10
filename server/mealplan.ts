// AI meal plans: a few days of meals that fit the person's calorie and macro goals, plus a shopping list.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { AI_LANGUAGE_NAMES, type Lang } from "../shared/languages.ts";
import { cleanPlan, PLAN_LENGTHS, type MealPlan } from "../shared/mealplan.ts";
import { AnalysisError, MODEL } from "./analyze.ts";

const n = z.number().finite();

export const PlanRequestSchema = z.object({
  days: z.union(PLAN_LENGTHS.map((d) => z.literal(d)) as [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<7>]),
  preferences: z.string().max(400),
  goals: z.object({ calories: n, protein: n, carbs: n, fat: n, fiber: n, sugar: n, sodium: n }),
  profile: z
    .object({ sex: z.enum(["male", "female"]), age: n, heightCm: n, weightKg: n, activity: z.string().max(20), goal: z.string().max(20) })
    .nullable(),
  usualFoods: z.array(z.string().max(120)).max(30),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

const MealSchema = z.object({
  meal: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  name: z.string().describe("Dish name, e.g. 'Phở gà' or 'Greek yogurt with berries'"),
  portion: z.string().describe("Portion in household units, e.g. '1 bowl', '2 slices'"),
  grams: z.number().describe("Weight of the portion in grams"),
  calories: z.number().describe("kcal for the portion"),
  protein: z.number().describe("grams"),
  carbs: z.number().describe("grams"),
  fat: z.number().describe("grams"),
  fiber: z.number().describe("grams"),
  sugar: z.number().describe("grams"),
  sodium: z.number().describe("milligrams"),
  recipe: z.string().describe("One or two short sentences on how to make or where to get it"),
});

const PlanSchema = z.object({
  title: z.string().describe("A short name for the plan (max ~6 words)"),
  days: z.array(z.object({ meals: z.array(MealSchema) })).describe("One entry per day, in order"),
  shopping: z
    .array(
      z.object({
        category: z.string().describe("Shop section, e.g. 'Vegetables', 'Meat & fish', 'Dry goods'"),
        items: z.array(z.object({ name: z.string(), amount: z.string().describe("Total for the whole plan, e.g. '500 g', '6'") })),
      }),
    )
    .describe("Everything to buy for the whole plan, combined and grouped by shop section"),
  tips: z.array(z.string()).describe("2–3 short practical tips for this plan (prep ahead, swaps)"),
});

const SYSTEM_PROMPT = `You are a practical dietitian planning meals for someone using a calorie-tracking app.

Plan the number of days asked for. Each day has breakfast, lunch and dinner, plus a snack when it helps reach the targets.
- Each day's total calories must land within about 5% of their daily calorie goal, and protein should reach their protein goal. Spread the rest sensibly across carbs and fat.
- Give realistic nutrition for each dish and portion. Numbers must add up: calories ≈ 4×protein + 4×carbs + 9×fat.
- Prefer everyday, affordable dishes that are easy to cook or buy, close to the foods they usually eat and their cuisine. Vietnamese and other Asian dishes are welcome when they fit.
- Follow their preferences strictly (diet, allergies, dislikes, budget, cooking time). Never include a food they say they avoid.
- Vary meals across days, but reuse ingredients so the shopping list stays short.
- The shopping list covers every ingredient for the whole plan, with total amounts, grouped by shop section. Leave out basics like salt, pepper, cooking oil and water.
- Never plan below about 1200 kcal (women) / 1500 kcal (men) a day, even if their goal is lower; plan at that floor instead and mention it in a tip.
- This is general wellness guidance, not medical advice.`;

const client = new Anthropic();

export async function writeMealPlan(input: PlanRequest, language: Lang = "en"): Promise<MealPlan> {
  const languageNote = language === "en" ? "" : ` Write every text field (dish names, portions, shopping list, tips) in ${AI_LANGUAGE_NAMES[language]}.`;
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium", format: betaZodOutputFormat(PlanSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [
      {
        role: "user",
        content: `Plan ${input.days} day${input.days > 1 ? "s" : ""} of meals for me.${languageNote}\n\n${JSON.stringify(input)}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new AnalysisError("The model declined to write this meal plan.", 422, "ai_refused");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new AnalysisError("Could not read the meal plan from the model response.", 502, "ai_unreadable");
  }
  const plan = cleanPlan(response.parsed_output, input.days);
  if (plan.days.length === 0 || plan.days.some((d) => d.meals.length === 0)) {
    throw new AnalysisError("The meal plan came back empty.", 502, "ai_unreadable");
  }
  return plan;
}

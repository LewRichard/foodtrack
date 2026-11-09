import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { AI_LANGUAGE_NAMES, type Lang } from "../shared/languages.ts";
import { clampHealthScore } from "../shared/nutrition.ts";
import type { WeeklyReport } from "../shared/report.ts";
import { AnalysisError, MODEL } from "./analyze.ts";

// The week the app sends: one summary per day (no photos, no account details).
const n = z.number().finite();
const DaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kcal: n,
  protein: n,
  carbs: n,
  fat: n,
  fiber: n,
  sugar: n,
  sodium: n,
  water: n, // glasses (250 ml)
  burned: n, // kcal from exercise
  weight: n.nullable(),
  healthScore: n.nullable(),
  meals: z
    .array(
      z.object({
        meal: z.enum(["breakfast", "lunch", "dinner", "snack"]),
        name: z.string().max(120),
        kcal: n,
        healthScore: n.nullable(),
      }),
    )
    .max(40),
});

export const ReportInputSchema = z.object({
  days: z.array(DaySchema).min(1).max(7),
  goals: z.object({ calories: n, protein: n, carbs: n, fat: n, fiber: n, sugar: n, sodium: n }),
  goalType: z.enum(["lose", "maintain", "gain"]).nullable(),
  targetWeight: n.nullable(),
  weightRatePerWeek: n.nullable(),
});
export type ReportInput = z.infer<typeof ReportInputSchema>;

const ReportSchema = z.object({
  headline: z.string().describe("A short, upbeat title for the week (max ~8 words)"),
  score: z.number().describe("Whole number 1–10 for how healthy and on-target the week was overall"),
  summary: z.string().describe("Two or three sentences: how the week went against the goals, with specific numbers"),
  wins: z.array(z.string()).describe("2–3 specific things that went well, citing days, foods or numbers"),
  improvements: z.array(z.string()).describe("2–3 specific things to improve, citing days, foods or numbers"),
  nextWeek: z.array(z.string()).describe("Exactly 3 small, concrete actions for next week"),
  mealIdea: z.string().describe("One healthy meal idea that fits their goals and the foods they already eat"),
});

const SYSTEM_PROMPT = `You are a friendly registered dietitian writing a weekly check-in for someone using a calorie-tracking app.

You get their last 7 days as JSON: daily calories and nutrients (protein/carbs/fat/fiber/sugar in grams, sodium in mg), water in 250 ml glasses, exercise calories, morning weight (kg) when logged, and the meals they logged with a 1–10 health score for photographed meals (10 = very healthy). You also get their daily goals, whether they want to lose, keep or gain weight, their goal weight and their recent weekly weight trend.

Write the check-in:
- Base everything on the data. Cite specific days, foods and numbers ("Thursday's fried chicken", "protein averaged 72 g of your 110 g goal").
- Days with no meals logged weren't tracked; don't treat them as fasting. If fewer than 4 days were logged, say the picture is partial and encourage logging.
- Compare against their goals. For weight loss, a steady 0.25–1 kg a week is healthy; flag much faster loss or eating far below goal as something to ease off.
- Be warm and encouraging, never shaming. Suggest swaps, not bans.
- Keep each list item to one sentence. Next week's actions must be small and concrete (e.g. "Add a portion of vegetables to lunch on workdays").
- This is general wellness guidance, not medical advice; don't diagnose.`;

const client = new Anthropic();

export async function writeWeeklyReport(input: ReportInput, language: Lang = "en"): Promise<WeeklyReport> {
  const languageNote = language === "en" ? "" : ` Write every text field in ${AI_LANGUAGE_NAMES[language]}.`;
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium", format: betaZodOutputFormat(ReportSchema) },
    // If the primary model declines, the API retries on a suitable fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [
      {
        role: "user",
        content: `Here is my week.${languageNote}\n\n${JSON.stringify(input)}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new AnalysisError("The model declined to write this report.", 422, "ai_refused");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new AnalysisError("Could not read the report from the model response.", 502, "ai_unreadable");
  }
  const r = response.parsed_output;
  return {
    headline: r.headline,
    score: clampHealthScore(r.score) ?? 5,
    summary: r.summary,
    wins: r.wins.slice(0, 4),
    improvements: r.improvements.slice(0, 4),
    nextWeek: r.nextWeek.slice(0, 3),
    mealIdea: r.mealIdea,
  };
}

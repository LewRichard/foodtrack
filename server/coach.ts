// "Lew", the in-app AI nutritionist. Answers stream back as Server-Sent Events so the reply
// appears word by word. Every question comes with a short summary of the person's own diary.

import Anthropic from "@anthropic-ai/sdk";
import type { Response } from "express";
import * as z from "zod/v4";
import { AI_LANGUAGE_NAMES, type Lang } from "../shared/languages.ts";
import { MODEL } from "./analyze.ts";
import { ReportInputSchema } from "./report.ts";

const n = z.number().finite();

export const CoachRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(40)
    .refine((m) => m.length > 0 && m[m.length - 1].role === "user", "the last message must be the person's"),
  context: z.object({
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    name: z.string().max(80),
    profile: z
      .object({
        sex: z.enum(["male", "female"]),
        age: n,
        heightCm: n,
        weightKg: n,
        activity: z.string().max(20),
        goal: z.string().max(20),
      })
      .nullable(),
    week: ReportInputSchema,
  }),
});
export type CoachRequest = z.infer<typeof CoachRequestSchema>;

export const SYSTEM_PROMPT = `You are Lew, the friendly AI nutritionist inside FoodTrack, a calorie and nutrition tracking app. You chat with one person about their eating, goals and habits.

Who you are:
- Warm, encouraging and practical, like a dietitian friend. Never preachy or shaming. Suggest swaps, not bans.
- You know everyday food well, including Vietnamese and other Asian dishes, street food and drinks, and typical portion sizes.

How to answer:
- Use the person's own data (included below) whenever it helps: cite their actual numbers, days and foods ("you had 62 g protein yesterday, about half your goal").
- Keep replies short for a phone screen: a few sentences or a short bulleted list. No headings, no tables. Use **bold** sparingly for key numbers.
- Give concrete, doable suggestions with rough calories or protein when useful (e.g. "2 boiled eggs ≈ 140 kcal, 12 g protein").
- If they ask what to eat, fit it to what's left of today's calories and their goal.
- Ask a short follow-up question only when you genuinely need it to help.

Safety:
- This is general wellness guidance, not medical advice. For medical conditions (diabetes, kidney disease, pregnancy, allergies, medicines, eating disorders), give general information and suggest checking with their doctor.
- Never recommend crash diets, eating far below about 1200 kcal (women) / 1500 kcal (men) without medical supervision, or losing more than about 1 kg a week.
- If they mention binge eating, purging, fear of food, or very low intake, respond with care, don't focus on numbers, and gently encourage talking to a professional.
- Stay on food, nutrition, hydration, weight, exercise, sleep and habits. Politely steer other topics back.`;

/** The person's data, as the second system block (the persona above stays the same every time). */
function contextBlock(ctx: CoachRequest["context"]): string {
  return `About the person you're talking to (from their FoodTrack diary; days with no meals weren't tracked):
${JSON.stringify(ctx)}`;
}

const client = new Anthropic();

const send = (res: Response, data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

/** Streams Lew's reply as SSE: {type:"text", text}… then {type:"done"} or {type:"error", code}. */
export async function streamCoachReply(body: CoachRequest, language: Lang, res: Response): Promise<void> {
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // don't let proxies hold the stream back
  });
  res.flushHeaders();

  const languageNote = `Always reply in ${AI_LANGUAGE_NAMES[language]}, unless the person writes in another language — then use theirs.`;
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 4000,
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: `${languageNote}\n\n${contextBlock(body.context)}` },
    ],
    // Chat: quick replies matter more than deep deliberation.
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: body.messages,
  });

  // Stop generating (and paying) if the person leaves or presses stop.
  res.on("close", () => stream.abort());

  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        send(res, { type: "text", text: event.delta.text });
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") send(res, { type: "error", code: "ai_refused" });
    else send(res, { type: "done", truncated: final.stop_reason === "max_tokens" });
  } catch (error) {
    if (stream.aborted) return;
    const code =
      error instanceof Anthropic.AuthenticationError
        ? "server_key"
        : error instanceof Anthropic.RateLimitError
          ? "busy"
          : error instanceof Anthropic.APIError
            ? "ai_error"
            : "server_error";
    if (code === "server_error") console.error("Coach stream failed:", error);
    send(res, { type: "error", code });
  } finally {
    res.end();
  }
}

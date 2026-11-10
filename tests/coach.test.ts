import { describe, expect, it } from "vitest";
import { CoachRequestSchema } from "../server/coach.ts";
import { coachContext, turnsToSend } from "../src/lib/coach.ts";
import { INITIAL_STATE } from "../src/lib/store.ts";

describe("Lew chat", () => {
  it("sends the recent conversation, ending with the person, without failed replies", () => {
    const turns = turnsToSend([
      { role: "assistant", content: "(welcome)", at: 1 },
      { role: "user", content: "Tối nay ăn gì?", at: 2 },
      { role: "assistant", content: "", at: 3, failed: true },
      { role: "user", content: "Mình còn 600 kcal", at: 4 },
    ]);
    expect(turns).toEqual([{ role: "user", content: "Tối nay ăn gì?\n\nMình còn 600 kcal" }]);
  });

  it("keeps only the last turns", () => {
    const long = Array.from({ length: 50 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `m${i}`, at: i }));
    long.push({ role: "user", content: "last", at: 99 });
    const turns = turnsToSend(long, 20);
    expect(turns.length).toBeLessThanOrEqual(20);
    expect(turns[0].role).toBe("user");
    expect(turns.at(-1)!.content).toContain("last");
  });

  it("builds a request the server accepts", () => {
    const body = { messages: [{ role: "user", content: "Hi" }], context: coachContext(INITIAL_STATE) };
    expect(CoachRequestSchema.safeParse(body).success).toBe(true);
    expect(CoachRequestSchema.safeParse({ ...body, messages: [{ role: "assistant", content: "Hi" }] }).success).toBe(false);
    expect(CoachRequestSchema.safeParse({ ...body, messages: [{ role: "user", content: "x".repeat(5000) }] }).success).toBe(false);
  });
});

describe("Lew request validation", () => {
  it("rejects an empty conversation without crashing", () => {
    expect(CoachRequestSchema.safeParse({ messages: [], context: coachContext(INITIAL_STATE) }).success).toBe(false);
    expect(CoachRequestSchema.safeParse({}).success).toBe(false);
  });
});

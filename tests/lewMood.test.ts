import { describe, expect, it } from "vitest";
import { lewMood, type DayFacts } from "../src/lib/lewMood.ts";

const base: DayFacts = {
  isToday: true,
  hour: 13,
  entries: 2,
  total: { calories: 900, protein: 50 },
  burned: 0,
  goals: { calories: 2000, protein: 110 },
  streak: { current: 2, loggedToday: true },
};
const mood = (over: Partial<DayFacts>) => lewMood({ ...base, ...over });

describe("lewMood", () => {
  it("says nothing about other days", () => {
    expect(mood({ isToday: false })).toBeNull();
  });

  it("nudges an empty day, protecting a streak first", () => {
    expect(mood({ entries: 0, streak: { current: 5, loggedToday: false } })).toMatchObject({ id: "keepStreak", vars: { n: 5 }, action: "scan" });
    expect(mood({ entries: 0, hour: 8, streak: { current: 0, loggedToday: false } })?.id).toBe("morning");
    expect(mood({ entries: 0, hour: 14, streak: { current: 0, loggedToday: false } })?.id).toBe("start");
  });

  it("is kind about going over, counting exercise", () => {
    expect(mood({ total: { calories: 2400, protein: 90 } })).toMatchObject({ id: "over", vars: { kcal: 400 } });
    expect(mood({ total: { calories: 2400, protein: 90 }, burned: 300 })?.id).not.toBe("over");
  });

  it("celebrates streak milestones and hitting the goal", () => {
    expect(mood({ streak: { current: 7, loggedToday: true } })).toMatchObject({ id: "streak", vars: { n: 7 } });
    expect(mood({ total: { calories: 1950, protein: 105 } })?.id).toBe("perfect");
    expect(mood({ total: { calories: 1950, protein: 60 } })).toMatchObject({ id: "onTarget", vars: { g: 50 } });
  });

  it("points out missing protein late in the day, otherwise shows what's left", () => {
    expect(mood({ hour: 18, total: { calories: 1200, protein: 40 } })).toMatchObject({ id: "protein", vars: { g: 70 }, action: "coach" });
    expect(mood({ hour: 18, total: { calories: 1200, protein: 90 } })).toMatchObject({ id: "evening", vars: { kcal: 800 } });
    expect(mood({})).toMatchObject({ id: "progress", vars: { kcal: 1100 } });
  });
});

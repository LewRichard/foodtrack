import { describe, expect, it } from "vitest";
import { projectedGoalDate, series, weeklyRate, weightAxis } from "../src/lib/weight.ts";
import { addDays } from "../src/lib/dates.ts";

const start = "2026-10-01";
// Losing 0.5 kg a week, weighed every other day, with ±0.3 kg day-to-day noise.
const noise = [0.3, -0.2, 0.1, -0.3, 0.2, 0, -0.1, 0.3, -0.2, 0.1, 0, -0.3, 0.2, 0.1, -0.1];
const losing = Object.fromEntries(noise.map((n, i) => [addDays(start, i * 2), 80 - (0.5 / 7) * i * 2 + n]));

describe("weight", () => {
  it("sorts weigh-ins and filters by date", () => {
    const s = series({ "2026-10-05": 79, "2026-10-01": 80, "2026-09-20": 81 }, "2026-10-01");
    expect(s).toEqual([
      { date: "2026-10-01", kg: 80 },
      { date: "2026-10-05", kg: 79 },
    ]);
  });

  it("finds the weekly rate through the noise", () => {
    const rate = weeklyRate(series(losing))!;
    expect(rate).toBeLessThan(-0.35);
    expect(rate).toBeGreaterThan(-0.65);
  });

  it("needs a few weigh-ins over at least a week", () => {
    expect(weeklyRate(series({ "2026-10-01": 80, "2026-10-02": 79.8 }))).toBeNull();
    expect(weeklyRate(series({ "2026-10-01": 80, "2026-10-02": 79.8, "2026-10-03": 79.9 }))).toBeNull();
  });

  it("projects the goal date only when heading towards it", () => {
    const latest = { date: "2026-11-01", kg: 78 };
    expect(projectedGoalDate(latest, -0.5, 75)).toBe("2026-12-13"); // 3 kg at 0.5/week = 42 days
    expect(projectedGoalDate(latest, 0.3, 75)).toBeNull(); // gaining, goal is lower
    expect(projectedGoalDate(latest, -0.5, null)).toBeNull();
    expect(projectedGoalDate(latest, -0.001, 60)).toBeNull(); // practically flat
    expect(projectedGoalDate({ date: "2026-11-01", kg: 60 }, 0.2, 65)).toBe(addDays("2026-11-01", 175)); // gaining: 5 kg at 0.2/week
    expect(projectedGoalDate({ date: "2026-11-01", kg: 60 }, 0.02, 65)).toBeNull(); // over two years away
  });

  it("makes a readable axis", () => {
    const a = weightAxis([78.4, 80.2]);
    expect(a.min).toBeLessThanOrEqual(78.4);
    expect(a.max).toBeGreaterThanOrEqual(80.2);
    expect(a.ticks.length).toBeGreaterThanOrEqual(3);
    expect(a.ticks.length).toBeLessThanOrEqual(8);
  });
});

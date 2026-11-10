import { describe, expect, it } from "vitest";
import { healthDays } from "../src/lib/health.ts";
import { INITIAL_STATE, withHealth, type AppState } from "../src/lib/store.ts";

const local = (date: string, time = "00:00") => new Date(`${date}T${time}:00`).toISOString();
const agg = (date: string, value: number, unit: "count" | "kilocalorie") => ({
  startDate: local(date),
  endDate: local(date, "23:59"),
  value,
  values: { sum: value },
  unit,
});
const kg = (date: string, time: string, value: number) => ({ dataType: "weight" as const, value, unit: "kilogram" as const, startDate: local(date, time), endDate: local(date, time) });

describe("healthDays", () => {
  it("groups by local day and keeps the last weigh-in of a day", () => {
    const days = healthDays(
      [agg("2026-11-09", 8123, "count"), agg("2026-11-10", 0, "count")],
      [agg("2026-11-09", 412.6, "kilocalorie")],
      [kg("2026-11-09", "07:00", 77.4), kg("2026-11-09", "21:00", 77.9), kg("2026-11-08", "07:00", 78)],
    );
    expect(days).toEqual({
      "2026-11-09": { steps: 8123, activeKcal: 412.6, weightKg: 77.9 },
      "2026-11-08": { weightKg: 78 },
    });
  });
});

describe("withHealth", () => {
  const base: AppState = {
    ...INITIAL_STATE,
    profile: { sex: "male", age: 30, heightCm: 172, weightKg: 80, activity: "light", goal: "lose" },
    burned: { "2026-11-08": 500, "2026-11-09": 100 },
    weights: { "2026-11-08": 79 },
    health: { connected: true, lastSync: null },
  };

  it("adds steps, raises burned calories and fills missing weigh-ins", () => {
    const next = withHealth(
      base,
      {
        "2026-11-08": { activeKcal: 300, weightKg: 78.2, steps: 4000 },
        "2026-11-09": { activeKcal: 412.6, weightKg: 77.94, steps: 8123 },
      },
      1000,
    );
    expect(next.steps).toEqual({ "2026-11-08": 4000, "2026-11-09": 8123 });
    expect(next.burned).toEqual({ "2026-11-08": 500, "2026-11-09": 413 }); // typed-in 500 kept
    expect(next.weights).toEqual({ "2026-11-08": 79, "2026-11-09": 77.9 }); // FoodTrack's own weigh-in kept
    expect(next.profile?.weightKg).toBe(77.9);
    expect(next.health.lastSync).toBe(1000);
    expect(next.sync.pendingDays).toEqual(expect.arrayContaining(["2026-11-09"]));
    expect(next.sync.pendingDays).not.toContain("2026-11-08");
  });

  it("changes nothing to sync when Health has nothing new", () => {
    const next = withHealth(base, { "2026-11-08": { activeKcal: 200 } }, 5);
    expect(next.burned).toEqual(base.burned);
    expect(next.sync.pendingDays).toEqual(base.sync.pendingDays);
    expect(next.settingsUpdatedAt).toBe(base.settingsUpdatedAt);
  });

  it("ignores impossible values and keeps 60 days of steps", () => {
    const days: Record<string, { steps?: number; weightKg?: number }> = { "bad-date": { steps: 5 }, "2026-11-10": { weightKg: 5000 } };
    for (let i = 1; i <= 70; i++) days[`2026-0${i <= 31 ? 8 : 9}-${String(((i - 1) % 31) + 1).padStart(2, "0")}`] = { steps: i };
    const next = withHealth(base, days, 1);
    expect(Object.keys(next.steps)).toHaveLength(60);
    expect(next.steps["bad-date"]).toBeUndefined();
    expect(next.weights["2026-11-10"]).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { liveStreak, rankStreaks } from "../src/lib/community.ts";

const TODAY = "2026-11-11";
const row = (id: string, current: number, longest: number, last: string | null) => ({ user_id: id, current_days: current, longest_days: longest, last_date: last });

describe("liveStreak", () => {
  it("counts a streak that reached today or yesterday, and drops older ones to 0", () => {
    expect(liveStreak(row("a", 5, 5, "2026-11-11"), TODAY)).toBe(5);
    expect(liveStreak(row("a", 5, 5, "2026-11-10"), TODAY)).toBe(5);
    expect(liveStreak(row("a", 5, 5, "2026-11-09"), TODAY)).toBe(0);
    expect(liveStreak(row("a", 5, 5, null), TODAY)).toBe(0);
  });
});

describe("rankStreaks", () => {
  it("sorts by live streak then best streak, sharing places on ties", () => {
    const ranked = rankStreaks(
      [row("stale", 40, 40, "2026-10-01"), row("b", 7, 7, TODAY), row("c", 12, 20, TODAY), row("d", 7, 30, "2026-11-10"), row("e", 0, 3, null)],
      TODAY,
    );
    expect(ranked.map((r) => [r.user_id, r.live, r.rank])).toEqual([
      ["c", 12, 1],
      ["d", 7, 2],
      ["b", 7, 2],
      ["stale", 0, 4],
      ["e", 0, 4],
    ]);
  });
});

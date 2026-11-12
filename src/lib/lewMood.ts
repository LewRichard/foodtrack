// What Lew says on the Diary today: one short reaction to how the day is going. Pure, so it's tested.

import type { Goals, Nutrients } from "../../shared/nutrition.ts";
import type { LewPose } from "../components/Lew.tsx";

export type LewMoodId = "start" | "morning" | "keepStreak" | "over" | "streak" | "perfect" | "onTarget" | "protein" | "evening" | "progress";

export interface LewMood {
  id: LewMoodId;
  pose: LewPose;
  vars: Record<string, number>;
  action: "scan" | "coach" | null;
}

export interface DayFacts {
  isToday: boolean;
  hour: number; // 0–23, local
  entries: number;
  total: Pick<Nutrients, "calories" | "protein">;
  burned: number;
  goals: Pick<Goals, "calories" | "protein">;
  streak: { current: number; loggedToday: boolean };
}

const MILESTONES = new Set([3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365]);

export function lewMood(d: DayFacts): LewMood | null {
  if (!d.isToday || d.goals.calories <= 0) return null;

  if (d.entries === 0) {
    if (d.streak.current > 0 && !d.streak.loggedToday) return { id: "keepStreak", pose: "think", vars: { n: d.streak.current }, action: "scan" };
    return { id: d.hour < 11 ? "morning" : "start", pose: "wave", vars: {}, action: "scan" };
  }

  const eaten = d.total.calories - d.burned;
  const left = Math.round(d.goals.calories - eaten);
  const ratio = eaten / d.goals.calories;
  const proteinShort = Math.round(d.goals.protein - d.total.protein);

  if (ratio > 1.1) return { id: "over", pose: "think", vars: { kcal: -left }, action: null };
  if (d.streak.loggedToday && MILESTONES.has(d.streak.current)) return { id: "streak", pose: "cheer", vars: { n: d.streak.current }, action: null };
  if (ratio >= 0.9) {
    return d.total.protein >= d.goals.protein * 0.9
      ? { id: "perfect", pose: "cheer", vars: {}, action: null }
      : { id: "onTarget", pose: "cheer", vars: { g: proteinShort }, action: null };
  }
  if (d.hour >= 16 && d.goals.protein > 0 && d.total.protein < d.goals.protein * 0.6) {
    return { id: "protein", pose: "point", vars: { g: proteinShort, kcal: left }, action: "coach" };
  }
  if (d.hour >= 17) return { id: "evening", pose: "point", vars: { kcal: left }, action: "coach" };
  return { id: "progress", pose: "wave", vars: { kcal: left }, action: null };
}

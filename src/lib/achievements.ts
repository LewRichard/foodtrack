// Streaks and badges, worked out from what's already in the diary (meals, water, weigh-ins,
// health scores). Nothing extra is stored, so they're the same on every device that syncs.

import { averageHealthScore, sumNutrients } from "../../shared/nutrition.ts";
import { addDays, todayKey } from "./dates.ts";
import type { AppState } from "./store.ts";
import type { IconName } from "../components/Icon.tsx";
import { series } from "./weight.ts";

export const WATER_GOAL = 8; // glasses

export interface Streak {
  current: number; // consecutive days with a meal logged, up to today (or yesterday if today isn't logged yet)
  longest: number;
  loggedToday: boolean;
}

/** Days with at least one meal logged. */
function loggedDays(s: Pick<AppState, "entries">): Set<string> {
  return new Set(s.entries.map((e) => e.date));
}

/** Longest run of consecutive dates in a set. */
function longestRun(dates: Set<string>): number {
  let best = 0;
  for (const d of dates) {
    if (dates.has(addDays(d, -1))) continue; // not the start of a run
    let n = 1;
    while (dates.has(addDays(d, n))) n++;
    best = Math.max(best, n);
  }
  return best;
}

export function streak(s: Pick<AppState, "entries">, today = todayKey()): Streak {
  const days = loggedDays(s);
  const loggedToday = days.has(today);
  let current = 0;
  for (let d = loggedToday ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) current++;
  return { current, longest: Math.max(longestRun(days), current), loggedToday };
}

// ---- Badges ------------------------------------------------------------------------------------------

export type BadgeId =
  | "first_meal"
  | "first_scan"
  | "streak_3"
  | "streak_7"
  | "streak_30"
  | "streak_100"
  | "meals_100"
  | "on_target"
  | "on_target_7"
  | "protein_day"
  | "protein_5"
  | "water_day"
  | "water_7"
  | "green_meal"
  | "healthy_day"
  | "healthy_week"
  | "first_weigh"
  | "weigh_10"
  | "lost_1"
  | "lost_5"
  | "goal_weight";

export interface Badge {
  id: BadgeId;
  icon: IconName;
  target: number;
  progress: number; // towards target (capped)
  earned: boolean;
}

interface DayStats {
  kcal: number;
  protein: number;
  water: number;
  health: number | null;
  scored: number;
}

function dayStats(s: AppState): Map<string, DayStats> {
  const byDate = new Map<string, AppState["entries"]>();
  for (const e of s.entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const dates = new Set([...byDate.keys(), ...Object.keys(s.water)]);
  const out = new Map<string, DayStats>();
  for (const d of dates) {
    const entries = byDate.get(d) ?? [];
    const total = sumNutrients(entries);
    out.set(d, {
      kcal: total.calories,
      protein: total.protein,
      water: s.water[d] ?? 0,
      health: averageHealthScore(entries),
      scored: entries.filter((e) => e.healthScore).length,
    });
  }
  return out;
}

const count = <T>(items: Iterable<T>, test: (x: T) => boolean) => {
  let n = 0;
  for (const x of items) if (test(x)) n++;
  return n;
};

export function badges(s: AppState, today = todayKey()): Badge[] {
  const stats = dayStats(s);
  const days = [...stats.values()];
  const { longest } = streak(s, today);
  const goal = s.goals;
  const onTarget = (d: DayStats) => d.kcal > 0 && Math.abs(d.kcal - goal.calories) <= goal.calories * 0.1;
  const waterDays = new Set([...stats].filter(([, d]) => d.water >= WATER_GOAL).map(([date]) => date));

  const weights = series(s.weights);
  const first = weights[0]?.kg;
  const lowest = weights.length ? Math.min(...weights.map((w) => w.kg)) : undefined;
  const latest = weights.at(-1)?.kg;
  const lost = first !== undefined && lowest !== undefined ? Math.max(0, Math.round((first - lowest) * 10) / 10) : 0;
  const goalType = s.profile?.goal ?? (s.targetWeight !== null && first !== undefined && s.targetWeight < first ? "lose" : "gain");
  const reachedGoal =
    s.targetWeight !== null &&
    latest !== undefined &&
    (goalType === "lose" ? latest <= s.targetWeight : goalType === "gain" ? latest >= s.targetWeight : Math.abs(latest - s.targetWeight) < 0.5);

  const list: [BadgeId, IconName, number, number][] = [
    ["first_meal", "utensils", 1, s.entries.length],
    ["first_scan", "camera", 1, count(s.entries, (e) => e.source === "scan")],
    ["streak_3", "flame", 3, longest],
    ["streak_7", "zap", 7, longest],
    ["streak_30", "trophy", 30, longest],
    ["streak_100", "gem", 100, longest],
    ["meals_100", "list-checks", 100, s.entries.length],
    ["on_target", "target", 1, count(days, onTarget)],
    ["on_target_7", "crosshair", 7, count(days, onTarget)],
    ["protein_day", "dumbbell", 1, count(days, (d) => goal.protein > 0 && d.protein >= goal.protein)],
    ["protein_5", "award", 5, count(days, (d) => goal.protein > 0 && d.protein >= goal.protein)],
    ["water_day", "droplet", 1, waterDays.size],
    ["water_7", "waves", 7, longestRun(waterDays)],
    ["green_meal", "salad", 1, count(s.entries, (e) => (e.healthScore ?? 0) >= 9)],
    ["healthy_day", "leaf", 1, count(days, (d) => d.health !== null && d.health >= 8)],
    ["healthy_week", "tree", 7, count(days, (d) => d.health !== null && d.health >= 7)],
    ["first_weigh", "scale", 1, weights.length],
    ["weigh_10", "trend-up", 10, weights.length],
    ["lost_1", "trend-down", 1, lost],
    ["lost_5", "medal", 5, lost],
    ["goal_weight", "flag", 1, reachedGoal ? 1 : 0],
  ];
  return list.map(([id, icon, target, value]) => ({ id, icon, target, progress: Math.min(value, target), earned: value >= target }));
}

/** Badges earned that this device hasn't celebrated yet. */
export function newBadges(all: Badge[], seen: readonly string[]): Badge[] {
  return all.filter((b) => b.earned && !seen.includes(b.id));
}

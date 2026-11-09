// Weight trend maths: the series, the weekly rate, and when the goal would be reached.

import { addDays, parseDateKey } from "./dates.ts";

export interface WeighIn {
  date: string;
  kg: number;
}

export function series(weights: Record<string, number>, since?: string): WeighIn[] {
  return Object.entries(weights)
    .filter(([date]) => !since || date >= since)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, kg]) => ({ date, kg }));
}

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Math.round(parseDateKey(date).getTime() / DAY_MS);

/**
 * The trend in kg per week, from a least-squares line through the weigh-ins of the last `windowDays`
 * days (single readings jump around with water and food, a line through several doesn't).
 * Null until there are at least 3 weigh-ins spread over a week or more.
 */
export function weeklyRate(points: WeighIn[], windowDays = 28): number | null {
  if (points.length < 3) return null;
  const last = dayNumber(points[points.length - 1].date);
  const recent = points.filter((p) => last - dayNumber(p.date) <= windowDays);
  if (recent.length < 3) return null;
  const xs = recent.map((p) => dayNumber(p.date));
  if (Math.max(...xs) - Math.min(...xs) < 7) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = recent.reduce((a, p) => a + p.kg, 0) / recent.length;
  let num = 0;
  let den = 0;
  recent.forEach((p, i) => {
    num += (xs[i] - mx) * (p.kg - my);
    den += (xs[i] - mx) ** 2;
  });
  return den === 0 ? null : (num / den) * 7;
}

/** The date the goal would be reached at the current rate, or null if not heading towards it (or > 2 years). */
export function projectedGoalDate(latest: WeighIn, ratePerWeek: number | null, target: number | null): string | null {
  if (ratePerWeek === null || target === null) return null;
  const remaining = target - latest.kg;
  if (Math.abs(remaining) < 0.05) return latest.date;
  if (Math.sign(remaining) !== Math.sign(ratePerWeek) || Math.abs(ratePerWeek) < 0.01) return null;
  const days = Math.ceil((remaining / ratePerWeek) * 7);
  return days > 730 ? null : addDays(latest.date, days);
}

/** Nice round axis bounds and ticks around the data (and the goal line, when it's close by). */
export function weightAxis(values: number[]): { min: number; max: number; ticks: number[] } {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 2) {
    const mid = (hi + lo) / 2;
    lo = mid - 1;
    hi = mid + 1;
  }
  const span = hi - lo;
  const step = span <= 4 ? 1 : span <= 10 ? 2 : span <= 25 ? 5 : 10;
  const min = Math.floor((lo - span * 0.1) / step) * step;
  const max = Math.ceil((hi + span * 0.1) / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10);
  return { min, max, ticks };
}

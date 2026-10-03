// Pure date + streak logic. No React Native imports so it can be unit tested in Node.
//
// Dates are "day keys" in the user's local calendar: "YYYY-MM-DD". A check-in is stamped with
// the local day it was taken on, so a 11pm workout counts for that day wherever the user lives.

export type DayKey = string;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** The local calendar day of `date` as "YYYY-MM-DD". */
export function toDayKey(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parses a day key into a Date at local noon (noon avoids DST edge cases when adding days). */
export function fromDayKey(key: DayKey): Date {
  if (!DAY_KEY.test(key)) throw new Error(`Invalid day key: ${key}`);
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = fromDayKey(key);
  date.setDate(date.getDate() + days);
  return toDayKey(date);
}

/** Monday of the week containing `key` (weeks run Monday–Sunday). */
export function weekStart(key: DayKey): DayKey {
  const date = fromDayKey(key);
  const offset = (date.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(key, -offset);
}

/**
 * Consecutive days with at least one check-in, ending today. If there is no check-in today yet
 * the streak is still alive and counts back from yesterday — it only breaks once a full day is missed.
 */
export function dailyStreak(days: Iterable<DayKey>, today: DayKey): number {
  const set = new Set(days);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Longest run of consecutive check-in days ever. */
export function longestDailyStreak(days: Iterable<DayKey>): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: DayKey | null = null;
  for (const day of sorted) {
    run = prev !== null && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

/** Number of distinct check-in days per week, keyed by the week's Monday. */
export function daysPerWeek(days: Iterable<DayKey>): Map<DayKey, number> {
  const counts = new Map<DayKey, number>();
  for (const day of new Set(days)) {
    const week = weekStart(day);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  return counts;
}

/**
 * Consecutive weeks in which the user hit their weekly goal (e.g. 3 gym days a week).
 * The current week counts once the goal is reached; until then it doesn't break the streak.
 * Rest days are built in, which is why this is the headline streak — a daily streak punishes recovery.
 */
export function weeklyStreak(days: Iterable<DayKey>, goal: number, today: DayKey): number {
  return weeklyStreakFor([days], [goal], today);
}

/**
 * Shared weekly streak: consecutive weeks in which *every* member hit their own weekly goal.
 * Used for buddy streaks between friends.
 */
export function weeklyStreakFor(members: Iterable<DayKey>[], goals: number[], today: DayKey): number {
  if (members.length === 0 || members.length !== goals.length) return 0;
  const perMember = members.map((days) => daysPerWeek(days));
  const metGoal = (week: DayKey) =>
    perMember.every((counts, i) => (counts.get(week) ?? 0) >= Math.max(1, goals[i]));

  const thisWeek = weekStart(today);
  let cursor = metGoal(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  let streak = 0;
  while (metGoal(cursor)) {
    streak++;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

export type StreakSummary = {
  weekStreak: number;
  dayStreak: number;
  longestDayStreak: number;
  thisWeekCount: number;
  goal: number;
  totalDays: number;
  checkedInToday: boolean;
};

export function summarize(days: DayKey[], goal: number, today: DayKey): StreakSummary {
  const unique = new Set(days);
  return {
    weekStreak: weeklyStreak(unique, goal, today),
    dayStreak: dailyStreak(unique, today),
    longestDayStreak: longestDailyStreak(unique),
    thisWeekCount: daysPerWeek(unique).get(weekStart(today)) ?? 0,
    goal,
    totalDays: unique.size,
    checkedInToday: unique.has(today),
  };
}

/** The 6×7 grid of day keys covering the month containing `key` (Monday-first, padded with adjacent months). */
export function monthGrid(key: DayKey): DayKey[] {
  const [y, m] = key.split('-').map(Number);
  const first = `${y}-${pad(m)}-01`;
  const start = weekStart(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function addMonths(key: DayKey, months: number): DayKey {
  const [y, m] = key.split('-').map(Number);
  const date = new Date(y, m - 1 + months, 1, 12);
  return toDayKey(date);
}

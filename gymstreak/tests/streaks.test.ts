import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  dailyStreak,
  longestDailyStreak,
  monthGrid,
  summarize,
  toDayKey,
  weekStart,
  weeklyStreak,
  weeklyStreakFor,
} from '../src/lib/streaks';

// 2026-10-07 is a Wednesday.
const WED = '2026-10-07';

describe('day keys', () => {
  it('formats local dates', () => {
    expect(toDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('finds the Monday of a week', () => {
    expect(weekStart(WED)).toBe('2026-10-05');
    expect(weekStart('2026-10-05')).toBe('2026-10-05');
    expect(weekStart('2026-10-11')).toBe('2026-10-05'); // Sunday
  });

  it('adds months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01');
  });

  it('builds a Monday-first month grid', () => {
    const grid = monthGrid('2026-10-20');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-09-28');
    expect(grid).toContain('2026-10-01');
    expect(grid).toContain('2026-10-31');
  });
});

describe('dailyStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(dailyStreak(['2026-10-05', '2026-10-06', WED], WED)).toBe(3);
  });

  it('stays alive when today has no check-in yet', () => {
    expect(dailyStreak(['2026-10-05', '2026-10-06'], WED)).toBe(2);
  });

  it('breaks after a missed day', () => {
    expect(dailyStreak(['2026-10-04', '2026-10-05'], WED)).toBe(0);
    expect(dailyStreak(['2026-10-03', '2026-10-05', '2026-10-06', WED], WED)).toBe(3);
  });

  it('ignores duplicate days', () => {
    expect(dailyStreak([WED, WED, WED], WED)).toBe(1);
  });
});

describe('longestDailyStreak', () => {
  it('finds the longest run', () => {
    expect(longestDailyStreak(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10', '2026-09-11'])).toBe(3);
    expect(longestDailyStreak([])).toBe(0);
  });
});

describe('weeklyStreak', () => {
  // Three gym days in each of the previous two weeks.
  const history = ['2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28', '2026-09-30', '2026-10-02'];

  it('counts finished weeks that met the goal while the current week is in progress', () => {
    expect(weeklyStreak(history, 3, WED)).toBe(2);
  });

  it('includes the current week once the goal is hit', () => {
    expect(weeklyStreak([...history, '2026-10-05', '2026-10-06', WED], 3, WED)).toBe(3);
  });

  it('breaks when a past week missed the goal', () => {
    expect(weeklyStreak(['2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28'], 3, WED)).toBe(0);
  });

  it('counts multiple check-ins on the same day once', () => {
    expect(weeklyStreak(['2026-09-28', '2026-09-28', '2026-09-28'], 2, WED)).toBe(0);
  });
});

describe('weeklyStreakFor (buddy streaks)', () => {
  it('requires every member to hit their own goal', () => {
    const me = ['2026-09-28', '2026-09-30', '2026-10-02', '2026-09-21', '2026-09-22', '2026-09-23'];
    const friend = ['2026-09-29', '2026-09-30', '2026-09-24']; // goal 2 → only last week met
    expect(weeklyStreakFor([me, friend], [3, 2], WED)).toBe(1);
    expect(weeklyStreakFor([me, friend], [3, 1], WED)).toBe(2);
  });

  it('is zero with no members', () => {
    expect(weeklyStreakFor([], [], WED)).toBe(0);
  });
});

describe('summarize', () => {
  it('reports progress for the current week', () => {
    const s = summarize(['2026-10-05', WED, WED], 4, WED);
    expect(s).toMatchObject({ thisWeekCount: 2, goal: 4, totalDays: 2, checkedInToday: true, dayStreak: 1 });
  });
});

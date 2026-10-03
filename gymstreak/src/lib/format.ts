import { fromDayKey, toDayKey, addDays, type DayKey } from './streaks';

export function formatWhen(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = toDayKey(date);
  const today = toDayKey(now);
  if (day === today) return `Today · ${time}`;
  if (day === addDays(today, -1)) return `Yesterday · ${time}`;
  return `${formatDay(day)} · ${time}`;
}

export function formatDay(key: DayKey): string {
  return fromDayKey(key).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatMonth(key: DayKey): string {
  return fromDayKey(key).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

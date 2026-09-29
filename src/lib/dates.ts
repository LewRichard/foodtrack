/** Local calendar date as YYYY-MM-DD (not UTC). */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function formatDateLabel(key: string): string {
  const today = todayKey();
  if (key === today) return "Today";
  if (key === addDays(today, -1)) return "Yesterday";
  return parseDateKey(key).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

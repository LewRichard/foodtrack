import type { I18n } from "../i18n/index.ts";

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

/** "Today", "Yesterday", or a short date, in the app's language. */
export function formatDateLabel(key: string, i18n: I18n): string {
  const today = todayKey();
  if (key === today) return i18n.t("date.today");
  if (key === addDays(today, -1)) return i18n.t("date.yesterday");
  return i18n.date(parseDateKey(key), { weekday: "short", month: "short", day: "numeric" });
}

export function formatLongDate(key: string, i18n: I18n): string {
  return i18n.date(parseDateKey(key), { weekday: "long", month: "long", day: "numeric" });
}

export function greetingKey(date = new Date()): "greet.morning" | "greet.afternoon" | "greet.evening" {
  const h = date.getHours();
  if (h < 12) return "greet.morning";
  if (h < 18) return "greet.afternoon";
  return "greet.evening";
}

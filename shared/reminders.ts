// Meal reminders: when each one is due, shared by the server (web push) and tests.

export type ReminderSlot = "breakfast" | "lunch" | "dinner";
export const REMINDER_SLOTS: ReminderSlot[] = ["breakfast", "lunch", "dinner"];

/** Times are local "HH:MM" in the person's time zone; null switches that reminder off. */
export interface ReminderTimes {
  breakfast: string | null;
  lunch: string | null;
  dinner: string | null;
}

export const DEFAULT_REMINDER_TIMES: ReminderTimes = { breakfast: "08:00", lunch: "12:30", dinner: "19:00" };

/**
 * A reminder can go out until this many minutes after its time. The server is woken every
 * ~10 minutes and may take a minute to start, so this leaves room for a couple of late runs.
 */
export const REMINDER_WINDOW_MINUTES = 45;

export const REMINDER_TEXT: Record<ReminderSlot, { title: string; body: string }> = {
  breakfast: { title: "🍳 Breakfast time", body: "Snap your breakfast to log it in seconds." },
  lunch: { title: "🥗 Lunch time", body: "Don't forget to log your lunch. Just take a photo." },
  dinner: { title: "🍲 Dinner time", body: "Log your dinner to keep today's diary complete." },
};

/** Minutes since midnight for "HH:MM" (also accepts Postgres "HH:MM:SS"), or null. */
export function parseTime(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** The local date (YYYY-MM-DD) and minutes since midnight at `now` in `timeZone` (UTC if unknown). */
export function localClock(now: Date, timeZone: string): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return localClock(now, "UTC");
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/**
 * Which reminders should go out now: their time has passed within the window today (local time)
 * and they haven't already been handled today (`lastSent[slot]` holds the local date last handled).
 */
export function dueReminders(
  times: ReminderTimes,
  timeZone: string,
  lastSent: Partial<Record<ReminderSlot, string>>,
  now: Date,
): { date: string; slots: ReminderSlot[] } {
  const { date, minutes } = localClock(now, timeZone);
  const slots = REMINDER_SLOTS.filter((slot) => {
    const at = parseTime(times[slot]);
    if (at === null || lastSent[slot] === date) return false;
    return minutes >= at && minutes < at + REMINDER_WINDOW_MINUTES;
  });
  return { date, slots };
}

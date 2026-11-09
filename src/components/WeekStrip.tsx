import { addDays, parseDateKey, todayKey } from "../lib/dates.ts";

const DAYS_BEFORE = 4;
const DAYS_AFTER = 2;

/**
 * A row of seven days, today near the right like a calendar week.
 * Dots mark days with food logged; future days can't be picked.
 */
export default function WeekStrip({
  date,
  onChange,
  hasEntries,
}: {
  date: string;
  onChange: (d: string) => void;
  hasEntries: (d: string) => boolean;
}) {
  const today = todayKey();
  // Keep today in view; if an older day is picked (e.g. from Trends or the date picker), show the week around it.
  const anchor = date >= addDays(today, -DAYS_BEFORE) ? today : date;
  const days = Array.from({ length: DAYS_BEFORE + DAYS_AFTER + 1 }, (_, i) => addDays(anchor, i - DAYS_BEFORE));

  return (
    <div className="week" role="tablist" aria-label="Choose a day">
      {days.map((d) => {
        const day = parseDateKey(d);
        const future = d > today;
        const selected = d === date;
        return (
          <button
            key={d}
            role="tab"
            aria-selected={selected}
            className={`week-day ${selected ? "selected" : ""} ${d === today ? "today" : ""}`}
            disabled={future}
            onClick={() => onChange(d)}
            aria-label={day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          >
            <span className="week-dow">{day.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3)}</span>
            <span className="week-num">{day.getDate()}</span>
            <span className={`week-dot ${hasEntries(d) ? "on" : ""}`} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

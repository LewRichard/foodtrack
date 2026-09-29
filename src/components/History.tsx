import { useMemo, useState } from "react";
import { sumNutrients, type Nutrients } from "../../shared/nutrition.ts";
import { addDays, formatDateLabel, parseDateKey, todayKey } from "../lib/dates.ts";
import { useAppState } from "../lib/store.ts";

interface Day {
  date: string;
  total: Nutrients;
  logged: boolean;
}

export default function History({ onPickDate }: { onPickDate: (d: string) => void }) {
  const state = useAppState();
  const [range, setRange] = useState<7 | 30>(7);
  const [hover, setHover] = useState<number | null>(null);
  const goal = state.goals.calories;

  const days: Day[] = useMemo(() => {
    const byDate = new Map<string, Nutrients[]>();
    for (const e of state.entries) {
      const list = byDate.get(e.date) ?? [];
      list.push(e);
      byDate.set(e.date, list);
    }
    const today = todayKey();
    return Array.from({ length: range }, (_, i) => {
      const date = addDays(today, i - range + 1);
      const list = byDate.get(date) ?? [];
      return { date, total: sumNutrients(list), logged: list.length > 0 };
    });
  }, [state.entries, range]);

  const logged = days.filter((d) => d.logged);
  const avg = sumNutrients(logged.map((d) => d.total));
  const n = Math.max(logged.length, 1);
  const avgKcal = Math.round(avg.calories / n);
  const onTarget = logged.filter((d) => Math.abs(d.total.calories - goal) <= goal * 0.1).length;
  const macroKcal = avg.protein * 4 + avg.carbs * 4 + avg.fat * 9;

  // Chart geometry
  const W = 340;
  const H = 180;
  const pad = { top: 12, right: 8, bottom: 22, left: 36 };
  const max = Math.max(goal * 1.25, ...days.map((d) => d.total.calories));
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const slot = innerW / days.length;
  const barW = Math.max(3, slot - 2); // 2px gap between adjacent bars
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const ticks = [0, Math.round(max / 2 / 100) * 100, Math.round(max / 100) * 100].filter((t, i, a) => a.indexOf(t) === i);
  const hovered = hover !== null ? days[hover] : null;

  return (
    <div className="page">
      <header className="date-nav">
        <h1>Trends</h1>
      </header>

      <div className="segmented">
        {([7, 30] as const).map((r) => (
          <button key={r} className={r === range ? "active" : ""} onClick={() => setRange(r)}>
            {r} days
          </button>
        ))}
      </div>

      <section className="stat-row">
        <div className="card stat">
          <span className="muted small">Avg calories</span>
          <strong>{logged.length ? avgKcal.toLocaleString() : "—"}</strong>
          <span className="muted small">goal {goal.toLocaleString()}</span>
        </div>
        <div className="card stat">
          <span className="muted small">Days logged</span>
          <strong>
            {logged.length}/{range}
          </strong>
          <span className="muted small">{onTarget} within ±10% of goal</span>
        </div>
      </section>

      <section className="card chart-card">
        <h2 className="title">Calories per day</h2>
        <div className="chart-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Daily calories bar chart" onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className="grid" />
                <text x={pad.left - 6} y={y(t)} className="axis" textAnchor="end" dominantBaseline="middle">
                  {t >= 1000 ? `${(t / 1000).toFixed(1)}k` : t}
                </text>
              </g>
            ))}
            {days.map((d, i) => {
              const x = pad.left + i * slot + (slot - barW) / 2;
              const h = Math.max(0, pad.top + innerH - y(d.total.calories));
              return (
                <g key={d.date}>
                  {d.logged && h > 0 && (
                    <path
                      d={roundedTopBar(x, pad.top + innerH - h, barW, h, Math.min(4, barW / 2))}
                      className={`bar ${hover === i ? "hover" : ""}`}
                    />
                  )}
                  {/* Hit target spans the whole column, bigger than the mark. */}
                  <rect
                    x={pad.left + i * slot}
                    y={pad.top}
                    width={slot}
                    height={innerH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onClick={() => (hover === i ? onPickDate(d.date) : setHover(i))}
                    style={{ cursor: "pointer" }}
                  />
                  {(range === 7 || i % 5 === 4) && (
                    <text x={pad.left + i * slot + slot / 2} y={H - 6} className="axis" textAnchor="middle">
                      {range === 7
                        ? parseDateKey(d.date).toLocaleDateString(undefined, { weekday: "narrow" })
                        : parseDateKey(d.date).getDate()}
                    </text>
                  )}
                </g>
              );
            })}
            <line x1={pad.left} x2={W - pad.right} y1={y(goal)} y2={y(goal)} className="goal-line" />
            <text x={W - pad.right} y={y(goal) - 4} className="axis" textAnchor="end">
              goal
            </text>
          </svg>
          {hovered && (
            <div className="tooltip">
              <strong>{formatDateLabel(hovered.date)}</strong>
              <span>{hovered.logged ? `${Math.round(hovered.total.calories).toLocaleString()} kcal` : "Nothing logged"}</span>
              {hovered.logged && (
                <span className="muted small">
                  P {Math.round(hovered.total.protein)}g · C {Math.round(hovered.total.carbs)}g · F{" "}
                  {Math.round(hovered.total.fat)}g
                </span>
              )}
              <button className="link small" onClick={() => onPickDate(hovered.date)}>
                Open day →
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="title">Average macro split</h2>
        {macroKcal > 0 ? (
          <>
            <div className="split" role="img" aria-label="Macro split by calories">
              <div style={{ flex: avg.protein * 4, background: "var(--protein)" }} />
              <div style={{ flex: avg.carbs * 4, background: "var(--carbs)" }} />
              <div style={{ flex: avg.fat * 9, background: "var(--fat)" }} />
            </div>
            <ul className="legend">
              <li>
                <i style={{ background: "var(--protein)" }} /> Protein {Math.round((avg.protein * 400) / macroKcal)}% ·{" "}
                {Math.round(avg.protein / n)} g/day
              </li>
              <li>
                <i style={{ background: "var(--carbs)" }} /> Carbs {Math.round((avg.carbs * 400) / macroKcal)}% ·{" "}
                {Math.round(avg.carbs / n)} g/day
              </li>
              <li>
                <i style={{ background: "var(--fat)" }} /> Fat {Math.round((avg.fat * 900) / macroKcal)}% ·{" "}
                {Math.round(avg.fat / n)} g/day
              </li>
            </ul>
          </>
        ) : (
          <p className="muted">Log some meals to see your macro split.</p>
        )}
      </section>

      <section className="card">
        <h2 className="title">Daily log</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Day</th>
              <th>kcal</th>
              <th>P</th>
              <th>C</th>
              <th>F</th>
            </tr>
          </thead>
          <tbody>
            {[...logged].reverse().map((d) => (
              <tr key={d.date} onClick={() => onPickDate(d.date)}>
                <td>{formatDateLabel(d.date)}</td>
                <td>{Math.round(d.total.calories).toLocaleString()}</td>
                <td>{Math.round(d.total.protein)}</td>
                <td>{Math.round(d.total.carbs)}</td>
                <td>{Math.round(d.total.fat)}</td>
              </tr>
            ))}
            {logged.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No meals logged in this range yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/** Bar with 4px rounded top corners, square at the baseline. */
function roundedTopBar(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

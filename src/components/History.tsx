import { useMemo, useState } from "react";
import { sumNutrients, type Nutrients } from "../../shared/nutrition.ts";
import { useI18n } from "../i18n/index.ts";
import { addDays, formatDateLabel, parseDateKey, todayKey } from "../lib/dates.ts";
import { useAppState } from "../lib/store.ts";

interface Day {
  date: string;
  total: Nutrients;
  logged: boolean;
}

export default function History({ onPickDate }: { onPickDate: (d: string) => void }) {
  const state = useAppState();
  const i18n = useI18n();
  const { t, num } = i18n;
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
      <header className="page-head">
        <h1>{t("trends.title")}</h1>
        <p className="muted">{t("trends.subtitle")}</p>
      </header>

      <div className="segmented">
        {([7, 30] as const).map((r) => (
          <button key={r} className={r === range ? "active" : ""} onClick={() => setRange(r)}>
            {t("trends.days", { n: r })}
          </button>
        ))}
      </div>

      <section className="stat-row">
        <div className="card stat">
          <span className="muted small">{t("trends.avgCalories")}</span>
          <strong>{logged.length ? num(avgKcal) : "—"}</strong>
          <span className="muted small">{t("trends.goal", { n: num(goal) })}</span>
        </div>
        <div className="card stat">
          <span className="muted small">{t("trends.daysLogged")}</span>
          <strong>
            {logged.length}/{range}
          </strong>
          <span className="muted small">{t("trends.onTarget", { n: onTarget })}</span>
        </div>
      </section>

      <section className="card chart-card">
        <h2 className="title">{t("trends.perDay")}</h2>
        <div className="chart-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={t("trends.chartAria")} onMouseLeave={() => setHover(null)}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={pad.left} x2={W - pad.right} y1={y(tick)} y2={y(tick)} className="grid" />
                <text x={pad.left - 6} y={y(tick)} className="axis" textAnchor="end" dominantBaseline="middle">
                  {tick >= 1000 ? `${num(tick / 1000, 1)}k` : tick}
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
                        ? i18n.date(parseDateKey(d.date), { weekday: "narrow" })
                        : parseDateKey(d.date).getDate()}
                    </text>
                  )}
                </g>
              );
            })}
            <line x1={pad.left} x2={W - pad.right} y1={y(goal)} y2={y(goal)} className="goal-line" />
            <text x={W - pad.right} y={y(goal) - 4} className="axis" textAnchor="end">
              {t("trends.goalLine")}
            </text>
          </svg>
          {hovered && (
            <div className="tooltip">
              <strong>{formatDateLabel(hovered.date, i18n)}</strong>
              <span>{hovered.logged ? `${num(hovered.total.calories)} kcal` : t("trends.nothingLogged")}</span>
              {hovered.logged && (
                <span className="muted small">
                  {t("abbr.protein")} {Math.round(hovered.total.protein)}g · {t("abbr.carbs")} {Math.round(hovered.total.carbs)}g ·{" "}
                  {t("abbr.fat")} {Math.round(hovered.total.fat)}g
                </span>
              )}
              <button className="link small" onClick={() => onPickDate(hovered.date)}>
                {t("trends.openDay")}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="title">{t("trends.macroSplit")}</h2>
        {macroKcal > 0 ? (
          <>
            <div className="split" role="img" aria-label={t("trends.macroAria")}>
              <div style={{ flex: avg.protein * 4, background: "var(--protein)" }} />
              <div style={{ flex: avg.carbs * 4, background: "var(--carbs)" }} />
              <div style={{ flex: avg.fat * 9, background: "var(--fat)" }} />
            </div>
            <ul className="legend">
              <li>
                <i style={{ background: "var(--protein)" }} />{" "}
                {t("trends.macroLine", { name: t("nutrient.protein"), pct: Math.round((avg.protein * 400) / macroKcal), grams: Math.round(avg.protein / n) })}
              </li>
              <li>
                <i style={{ background: "var(--carbs)" }} />{" "}
                {t("trends.macroLine", { name: t("nutrient.carbs"), pct: Math.round((avg.carbs * 400) / macroKcal), grams: Math.round(avg.carbs / n) })}
              </li>
              <li>
                <i style={{ background: "var(--fat)" }} />{" "}
                {t("trends.macroLine", { name: t("nutrient.fat"), pct: Math.round((avg.fat * 900) / macroKcal), grams: Math.round(avg.fat / n) })}
              </li>
            </ul>
          </>
        ) : (
          <p className="muted">{t("trends.noMacros")}</p>
        )}
      </section>

      <section className="card">
        <h2 className="title">{t("trends.dailyLog")}</h2>
        <table className="table">
          <thead>
            <tr>
              <th>{t("trends.day")}</th>
              <th>kcal</th>
              <th>{t("abbr.protein")}</th>
              <th>{t("abbr.carbs")}</th>
              <th>{t("abbr.fat")}</th>
            </tr>
          </thead>
          <tbody>
            {[...logged].reverse().map((d) => (
              <tr key={d.date} onClick={() => onPickDate(d.date)}>
                <td>{formatDateLabel(d.date, i18n)}</td>
                <td>{num(d.total.calories)}</td>
                <td>{Math.round(d.total.protein)}</td>
                <td>{Math.round(d.total.carbs)}</td>
                <td>{Math.round(d.total.fat)}</td>
              </tr>
            ))}
            {logged.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  {t("trends.noMeals")}
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

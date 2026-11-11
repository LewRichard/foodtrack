import { useMemo, useRef, useState, type FormEvent } from "react";
import { useI18n } from "../i18n/index.ts";
import { addDays, formatDateLabel, formatLongDate, parseDateKey, todayKey } from "../lib/dates.ts";
import { actions, latestWeight, useAppState } from "../lib/store.ts";
import { projectedGoalDate, series, weeklyRate, weightAxis, type WeighIn } from "../lib/weight.ts";
import Sheet from "./Sheet.tsx";
import { Icon } from "./Icon.tsx";

const MIN_KG = 20;
const MAX_KG = 400;

function parseKg(text: string): number | null {
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) && n >= MIN_KG && n <= MAX_KG ? Math.round(n * 10) / 10 : null;
}

// ---- Logging a weigh-in --------------------------------------------------------------------------

export function WeightSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { weights, profile, targetWeight } = useAppState();
  const i18n = useI18n();
  const { t, num } = i18n;
  const existing = weights[date];
  const start = existing ?? latestWeight(weights)?.kg ?? profile?.weightKg ?? 60;
  const [value, setValue] = useState(String(start));
  const [target, setTarget] = useState(targetWeight === null ? "" : String(targetWeight));
  const [error, setError] = useState("");
  const kg = parseKg(value);

  function step(delta: number) {
    const base = parseKg(value) ?? start;
    setValue(String(Math.round((base + delta) * 10) / 10));
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (kg === null) return setError(t("weight.invalid"));
    actions.setWeight(date, kg);
    const goal = target.trim() ? parseKg(target) : null;
    if (target.trim() && goal === null) return setError(t("weight.invalid"));
    if (goal !== targetWeight) actions.setTargetWeight(goal);
    onClose();
  }

  return (
    <Sheet title={t("weight.sheetTitle", { date: formatDateLabel(date, i18n) })} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <div className="weight-input">
          <button type="button" className="icon-btn big" onClick={() => step(-0.1)} aria-label={t("weight.less")}>
            −
          </button>
          <label className="weight-value">
            <input
              type="number"
              inputMode="decimal"
              step={0.1}
              min={MIN_KG}
              max={MAX_KG}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
              aria-label={t("weight.title")}
              autoFocus
            />
            <span>kg</span>
          </label>
          <button type="button" className="icon-btn big" onClick={() => step(0.1)} aria-label={t("weight.more")}>
            +
          </button>
        </div>
        {existing !== undefined && existing !== kg && kg !== null && (
          <p className="muted small center">{t("weight.replaces", { kg: num(existing, 1) })}</p>
        )}
        <label className="stack">
          <span className="label">{t("weight.target")}</span>
          <div className="row gap center-items">
            <input
              className="grow"
              type="number"
              inputMode="decimal"
              step={0.1}
              min={MIN_KG}
              max={MAX_KG}
              value={target}
              placeholder={t("weight.targetPlaceholder")}
              onChange={(e) => {
                setTarget(e.target.value);
                setError("");
              }}
            />
            <span className="muted">kg</span>
          </div>
          <span className="muted small">{t("weight.targetHint")}</span>
        </label>
        {error && <p className="error small">{error}</p>}
        <div className="row gap">
          {existing !== undefined && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                actions.setWeight(date, null);
                onClose();
              }}
            >
              {t("common.delete")}
            </button>
          )}
          <button className="btn primary grow" disabled={kg === null}>
            {t("common.save")}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

// ---- Diary tile --------------------------------------------------------------------------------------

export function WeightTile({ date }: { date: string }) {
  const { weights } = useAppState();
  const i18n = useI18n();
  const { t, num } = i18n;
  const [open, setOpen] = useState(false);
  const today = weights[date];
  const last = latestWeight(Object.fromEntries(Object.entries(weights).filter(([d]) => d <= date)));
  const previous = last && today !== undefined ? latestWeight(Object.fromEntries(Object.entries(weights).filter(([d]) => d < date))) : null;
  const diff = previous && today !== undefined ? today - previous.kg : null;

  return (
    <section className="card meal">
      <div className="meal-head">
        <span className="tile tile-weight" aria-hidden="true">
          <Icon name="scale" />
        </span>
        <div className="meal-title">
          <h3>{t("weight.title")}</h3>
          <span className="muted">
            {today !== undefined
              ? diff !== null && Math.abs(diff) >= 0.05
                ? t("weight.withChange", { kg: num(today, 1), diff: `${diff > 0 ? "+" : "−"}${num(Math.abs(diff), 1)}` })
                : t("weight.kg", { kg: num(today, 1) })
              : last
                ? t("weight.last", { kg: num(last.kg, 1), date: formatDateLabel(last.date, i18n) })
                : t("weight.none")}
          </span>
        </div>
        <button className="plus-btn" onClick={() => setOpen(true)} aria-label={t("weight.log")}>
          <Icon name={today !== undefined ? "pen" : "plus"} size={18} strokeWidth={2} />
        </button>
      </div>
      {open && <WeightSheet date={date} onClose={() => setOpen(false)} />}
    </section>
  );
}

// ---- Progress card with chart (Trends tab) ---------------------------------------------------------

type Range = 30 | 90 | 365 | 0; // 0 = everything

export function WeightProgress() {
  const { weights, targetWeight } = useAppState();
  const i18n = useI18n();
  const { t, num } = i18n;
  const [range, setRange] = useState<Range>(90);
  const [editing, setEditing] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const all = useMemo(() => series(weights), [weights]);
  const today = todayKey();
  const since = range ? addDays(today, -range + 1) : undefined;
  const points = useMemo(() => series(weights, since), [weights, since]);
  const latest = all.at(-1) ?? null;
  const rate = weeklyRate(all);
  const eta = latest ? projectedGoalDate(latest, rate, targetWeight) : null;
  const change = points.length >= 2 ? points[points.length - 1].kg - points[0].kg : null;
  const signed = (n: number, digits = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${num(Math.abs(n), digits)}`;

  const ranges: { r: Range; label: string }[] = [
    { r: 30, label: t("weight.range1m") },
    { r: 90, label: t("weight.range3m") },
    { r: 365, label: t("weight.range1y") },
    { r: 0, label: t("weight.rangeAll") },
  ];

  // Chart geometry (same style as the calorie chart).
  const W = 340;
  const H = 190;
  const pad = { top: 14, right: 12, bottom: 22, left: 34 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const dayMs = 86_400_000;
  const t0 = parseDateKey(since ?? points[0]?.date ?? today).getTime();
  const t1 = parseDateKey(today).getTime();
  const spanDays = Math.max(1, Math.round((t1 - t0) / dayMs));
  const values = points.map((p) => p.kg);
  // Show the goal line when it's near the data, so it doesn't squash the line flat.
  const showGoal =
    targetWeight !== null && values.length > 0 && targetWeight >= Math.min(...values) - 5 && targetWeight <= Math.max(...values) + 5;
  const axis = values.length ? weightAxis(showGoal ? [...values, targetWeight!] : values) : null;
  const x = (p: WeighIn) => pad.left + ((parseDateKey(p.date).getTime() - t0) / dayMs / spanDays) * innerW;
  const y = (kg: number) => (axis ? pad.top + innerH - ((kg - axis.min) / (axis.max - axis.min)) * innerH : 0);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  const hovered = hover !== null ? points[hover] : null;

  function pick(clientX: number) {
    const svg = svgRef.current;
    if (!svg || !points.length) return;
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p) - px) < Math.abs(x(points[best]) - px)) best = i;
    });
    setHover(best);
  }

  // First, middle and last dates, skipping any that would overlap the one before (about 70 px apart).
  const xLabels = [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]]
    .filter((p, i, a) => p && a.findIndex((q) => q?.date === p.date) === i)
    .reduce<WeighIn[]>((kept, p) => {
      const prev = kept[kept.length - 1];
      if (!prev || x(p) - x(prev) >= 70) kept.push(p);
      else if (p === points[points.length - 1] && kept.length > 1) kept[kept.length - 1] = p;
      return kept;
    }, []);

  return (
    <section className="card chart-card weight-card">
      <div className="row between">
        <h2 className="title">{t("weight.title")}</h2>
        <button className="btn small-btn primary" onClick={() => setEditing(today)}>
          {t("weight.log")}
        </button>
      </div>

      {all.length === 0 ? (
        <p className="muted">{t("weight.empty")}</p>
      ) : (
        <>
          <div className="weight-stats">
            <div>
              <span className="muted small">{t("weight.current")}</span>
              <strong>
                {num(latest!.kg, 1)} <small>kg</small>
              </strong>
            </div>
            <div>
              <span className="muted small">{t("weight.change")}</span>
              <strong>
                {change === null ? "—" : signed(change)} {change !== null && <small>kg</small>}
              </strong>
            </div>
            <div>
              <span className="muted small">{t("weight.pace")}</span>
              <strong>
                {rate === null ? "—" : signed(rate, 2)} {rate !== null && <small>{t("weight.perWeekUnit")}</small>}
              </strong>
            </div>
          </div>

          <div className="segmented" role="tablist">
            {ranges.map(({ r, label }) => (
              <button key={r} role="tab" aria-selected={range === r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>
                {label}
              </button>
            ))}
          </div>

          {points.length === 0 ? (
            <p className="muted small">{t("weight.noneInRange")}</p>
          ) : (
            <div className="chart-wrap">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="chart weight-chart"
                role="img"
                aria-label={t("weight.chartAria")}
                onPointerMove={(e) => pick(e.clientX)}
                onPointerDown={(e) => pick(e.clientX)}
                onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
              >
                {axis!.ticks.map((tick) => (
                  <g key={tick}>
                    <line x1={pad.left} x2={W - pad.right} y1={y(tick)} y2={y(tick)} className="grid" />
                    <text x={pad.left - 6} y={y(tick)} className="axis" textAnchor="end" dominantBaseline="middle">
                      {num(tick, tick % 1 ? 1 : 0)}
                    </text>
                  </g>
                ))}
                {showGoal && (
                  <>
                    <line x1={pad.left} x2={W - pad.right} y1={y(targetWeight!)} y2={y(targetWeight!)} className="goal-line" />
                    <text x={W - pad.right} y={y(targetWeight!) - 4} className="axis" textAnchor="end">
                      {t("weight.goalLine", { kg: num(targetWeight!, 1) })}
                    </text>
                  </>
                )}
                <path d={path} className="weight-line" />
                {/* Dots only when there are few weigh-ins; otherwise just the latest, so the line stays clean. */}
                {points.length <= 12 &&
                  points.slice(0, -1).map((p) => <circle key={p.date} cx={x(p)} cy={y(p.kg)} r={4} className="weight-dot" />)}
                <circle cx={x(points[points.length - 1])} cy={y(points[points.length - 1].kg)} r={5} className="weight-dot" />
                {hovered && (
                  <>
                    <line x1={x(hovered)} x2={x(hovered)} y1={pad.top} y2={pad.top + innerH} className="crosshair" />
                    <circle cx={x(hovered)} cy={y(hovered.kg)} r={6} className="weight-dot hover" />
                  </>
                )}
                {xLabels.map((p, i) => (
                  <text
                    key={p.date}
                    x={x(p)}
                    y={H - 6}
                    className="axis"
                    textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}
                  >
                    {i18n.date(parseDateKey(p.date), { day: "numeric", month: "short" })}
                  </text>
                ))}
              </svg>
              {hovered && (
                <div className="tooltip">
                  <strong>{num(hovered.kg, 1)} kg</strong>
                  <span className="muted small">{formatDateLabel(hovered.date, i18n)}</span>
                </div>
              )}
            </div>
          )}

          <div className="weight-goal">
            {targetWeight === null ? (
              <button className="link" onClick={() => setEditing(latest!.date)}>
                <Icon name="target" size={16} /> {t("weight.setGoal")}
              </button>
            ) : Math.abs(targetWeight - latest!.kg) < 0.05 ? (
              <p><Icon name="party" size={16} /> {t("weight.reached", { kg: num(targetWeight, 1) })}</p>
            ) : (
              <>
                <p>
                  <Icon name="target" size={16} /> {t("weight.toGo", { n: num(Math.abs(targetWeight - latest!.kg), 1), kg: num(targetWeight, 1) })}
                </p>
                <p className="muted small">
                  {eta
                    ? t("weight.eta", { date: formatLongDate(eta, i18n) })
                    : rate === null
                      ? t("weight.needMore")
                      : t("weight.awayFromGoal")}
                </p>
              </>
            )}
          </div>

          <details className="weight-history">
            <summary>{t("weight.history")}</summary>
            <table className="table">
              <tbody>
                {[...all]
                  .reverse()
                  .slice(0, 30)
                  .map((p, i, list) => {
                    const prev = list[i + 1];
                    const d = prev ? p.kg - prev.kg : null;
                    return (
                      <tr key={p.date} onClick={() => setEditing(p.date)}>
                        <td>{formatDateLabel(p.date, i18n)}</td>
                        <td>
                          <strong>{num(p.kg, 1)} kg</strong>
                        </td>
                        <td className="muted">{d === null || Math.abs(d) < 0.05 ? "" : signed(d)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </details>
        </>
      )}
      {editing && <WeightSheet date={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

import { useI18n } from "../i18n/index.ts";

/** Calorie ring: fills as you eat; turns amber when you go over. */
export function CalorieRing({ eaten, goal }: { eaten: number; goal: number }) {
  const size = 176;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(eaten / goal, 1) : 0;
  const remaining = Math.round(goal - eaten);
  const over = remaining < 0;
  const { t, num } = useI18n();

  return (
    <div className="ring" role="img" aria-label={t("ring.aria", { eaten: num(eaten), goal: num(goal) })}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ring-start)" />
            <stop offset="100%" stopColor="var(--ring-end)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} />
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            className={`ring-value ${over ? "over" : ""}`}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className="ring-label">
        <strong>{num(Math.abs(remaining))}</strong>
        <span>{over ? t("ring.over") : t("ring.left")}</span>
      </div>
    </div>
  );
}

/** Small card for one macro: value / goal with a progress bar. */
export function MacroCard({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  return (
    <div className="macro-card">
      <span className="macro-label">{label}</span>
      <span className="macro-value">
        <strong>{Math.round(value)}</strong>
        <small>/{goal}g</small>
      </span>
      <div className="nbar-track" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="nbar-fill" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
    </div>
  );
}

/** One row with value / goal and a bar (used for fiber, sugar, sodium). */
export function NutrientBar({
  label,
  value,
  goal,
  unit,
  color,
  limit = false,
}: {
  label: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
  /** true for nutrients where the goal is a ceiling (sugar, sodium) */
  limit?: boolean;
}) {
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  const over = limit && value > goal;
  const { num } = useI18n();
  return (
    <div className="nbar">
      <div className="nbar-head">
        <span>{label}</span>
        <span className="muted">
          <b className={over ? "text-warn" : undefined}>{num(value)}</b> / {num(goal)} {unit}
          {over && " !"}
        </span>
      </div>
      <div className="nbar-track">
        <div className="nbar-fill" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
    </div>
  );
}

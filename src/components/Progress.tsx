export function CalorieRing({ eaten, goal }: { eaten: number; goal: number }) {
  const size = 168;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(eaten / goal, 1) : 0;
  const remaining = Math.round(goal - eaten);
  const over = remaining < 0;

  return (
    <div className="ring" role="img" aria-label={`${Math.round(eaten)} of ${goal} calories eaten`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} />
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
      </svg>
      <div className="ring-label">
        <strong>{Math.abs(remaining).toLocaleString()}</strong>
        <span>{over ? "kcal over" : "kcal left"}</span>
      </div>
    </div>
  );
}

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
  return (
    <div className="nbar">
      <div className="nbar-head">
        <span>{label}</span>
        <span className="muted">
          <b className={over ? "text-warn" : undefined}>{Math.round(value).toLocaleString()}</b> /{" "}
          {goal.toLocaleString()} {unit}
          {over && " ⚠"}
        </span>
      </div>
      <div className="nbar-track">
        <div className="nbar-fill" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
    </div>
  );
}

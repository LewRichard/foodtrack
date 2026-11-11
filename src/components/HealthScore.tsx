import { healthTier, type HealthTier } from "../../shared/nutrition.ts";
import { useI18n, type MessageKey } from "../i18n/index.ts";

const TIER_LABEL: Record<HealthTier, MessageKey> = {
  great: "health.great",
  good: "health.good",
  fair: "health.fair",
  poor: "health.poor",
};


/** A ring showing the score out of 10, coloured by how healthy it is (and always labelled in words). */
export function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const { num } = useI18n();
  const tier = healthTier(score);
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`score-ring tier-${tier}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="score-track" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="score-fill"
        strokeDasharray={`${(c * score) / 10} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="score-text" style={{ fontSize: size * 0.34 }}>
        {num(score, score % 1 ? 1 : 0)}
      </text>
    </svg>
  );
}

/** The health score of a scanned meal with the AI's one-line reason. */
export function HealthScoreCard({ score, reason }: { score: number; reason: string }) {
  const { t } = useI18n();
  const tier = healthTier(score);
  return (
    <div className="card health-card" role="group" aria-label={t("health.aria", { score })}>
      <span className={`score-dot tier-${tier}`} aria-hidden="true">
        {score}
      </span>
      <div>
        <p className="label">{t("health.title")}</p>
        <strong>
          {t(TIER_LABEL[tier])} · {score}/10
        </strong>
        {reason && <p className="muted small">{reason}</p>}
      </div>
    </div>
  );
}

/** Small coloured score dot next to a diary entry. */
export function HealthChip({ score }: { score: number }) {
  const { t } = useI18n();
  const tier = healthTier(score);
  return (
    <span className={`health-chip tier-${tier}`} title={t("health.aria", { score })}>
      {score}
    </span>
  );
}

export function tierLabel(score: number): MessageKey {
  return TIER_LABEL[healthTier(score)];
}

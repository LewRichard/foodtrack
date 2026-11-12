import { useState, type ReactNode } from "react";
import { useI18n, type MessageKey } from "../i18n/index.ts";
import { todayKey } from "../lib/dates.ts";
import { lewMood, type DayFacts } from "../lib/lewMood.ts";
import { Icon } from "./Icon.tsx";
import { Lew, type LewPose } from "./Lew.tsx";

/** Lew with a speech bubble: used for empty screens and Lew's reactions on the Diary. */
export function LewCard({
  pose = "wave",
  title,
  text,
  actions,
  onClose,
  className = "",
}: {
  pose?: LewPose;
  title?: string;
  text: string;
  actions?: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <section className={`lew-card ${className}`}>
      <Lew pose={pose} size={64} />
      <div className="lew-card-bubble">
        {onClose && (
          <button className="lew-card-close" onClick={onClose} aria-label={t("common.close")}>
            <Icon name="x" size={14} />
          </button>
        )}
        {title && <strong className="lew-card-title">{title}</strong>}
        <p>{text}</p>
        {actions && <div className="lew-card-actions">{actions}</div>}
      </div>
    </section>
  );
}

// ---- Lew's reaction to today on the Diary --------------------------------------------------------

const DISMISS_KEY = "foodtrack:lewDismissed";

function dismissed(): string {
  try {
    return localStorage.getItem(DISMISS_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Lew's one-line take on the day so far, with a shortcut when one helps. Hidden for the day once closed. */
export function LewToday({ facts, onScan, onCoach }: { facts: DayFacts; onScan: () => void; onCoach: () => void }) {
  const { t, num } = useI18n();
  const [hidden, setHidden] = useState(dismissed);
  const mood = lewMood(facts);
  if (!mood) return null;
  const key = `${todayKey()}:${mood.id}`;
  if (hidden === key) return null;
  const vars = Object.fromEntries(Object.entries(mood.vars).map(([k, v]) => [k, num(v)]));
  return (
    <LewCard
      className="lew-today"
      pose={mood.pose}
      text={t(`lew.mood.${mood.id}` as MessageKey, vars)}
      onClose={() => {
        try {
          localStorage.setItem(DISMISS_KEY, key);
        } catch {
          // not remembered
        }
        setHidden(key);
      }}
      actions={
        mood.action === "scan" ? (
          <button className="btn small-btn primary" onClick={onScan}>
            <Icon name="camera" size={16} /> {t("lew.action.scan")}
          </button>
        ) : mood.action === "coach" ? (
          <button className="btn small-btn" onClick={onCoach}>
            <Icon name="message" size={16} /> {t("lew.action.coach")}
          </button>
        ) : undefined
      }
    />
  );
}

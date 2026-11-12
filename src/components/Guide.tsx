import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n, type MessageKey } from "../i18n/index.ts";
import { usePlan } from "../lib/plan.ts";
import { actions, useAppState } from "../lib/store.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { Lew, type LewPose } from "./Lew.tsx";
import { CalorieRing } from "./Progress.tsx";

type StepId = "welcome" | "scan" | "calories" | "ways" | "lew" | "habits" | "ready";

const STEPS: { id: StepId; pose: LewPose }[] = [
  { id: "welcome", pose: "wave" },
  { id: "scan", pose: "point" },
  { id: "calories", pose: "point" },
  { id: "ways", pose: "think" },
  { id: "lew", pose: "wave" },
  { id: "habits", pose: "point" },
  { id: "ready", pose: "cheer" },
];

/**
 * Lew's short tour for new accounts, shown once after the welcome questions and replayable from
 * Profile. Lew explains each part of the app in a speech bubble above a small illustration.
 */
export default function Guide({ onScan }: { onScan: () => void }) {
  const { t, num } = useI18n();
  const state = useAppState();
  const plan = usePlan();
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const freeLimit = plan?.enforced && !plan.premium ? plan.limit : null;

  const close = () => actions.setGuide(false);
  const next = () => (last ? close() : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(STEPS.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "Escape") actions.setGuide(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const firstName = state.name.trim().split(/\s+/)[0] ?? "";
  const title =
    step.id === "welcome" ? (firstName ? t("guide.welcome.titleNamed", { name: firstName }) : t("guide.welcome.title")) : t(`guide.${step.id}.title` as MessageKey);
  const body =
    step.id === "calories"
      ? t("guide.calories.body", { kcal: num(state.goals.calories) })
      : step.id === "ready"
        ? freeLimit
          ? t("guide.ready.bodyFree", { n: freeLimit })
          : t("guide.ready.body")
        : t(`guide.${step.id}.body` as MessageKey);

  return createPortal(
    <div
      className="guide"
      role="dialog"
      aria-modal="true"
      aria-label={t("guide.label")}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        if (start === null) return;
        const dx = e.changedTouches[0].clientX - start;
        if (dx < -50) setIndex((i) => Math.min(STEPS.length - 1, i + 1));
        else if (dx > 50) back();
      }}
    >
      <div className="guide-inner">
        <header className="guide-top">
          <div className="guide-progress" aria-label={t("guide.progress", { n: index + 1, total: STEPS.length })}>
            {STEPS.map((s, i) => (
              <span key={s.id} className={i <= index ? "done" : ""} />
            ))}
          </div>
          {!last && (
            <button className="link small guide-skip" onClick={close}>
              {t("guide.skip")}
            </button>
          )}
        </header>

        <div className="guide-stage" key={step.id}>
          <div className={`guide-lew ${step.id === "welcome" || last ? "big" : ""}`}>
            <Lew pose={step.pose} size={step.id === "welcome" || last ? 150 : 96} />
          </div>
          <div className="guide-bubble" aria-live="polite">
            <h2>{title}</h2>
            <p>{body}</p>
          </div>
          <Art step={step.id} />
        </div>

        <footer className="guide-actions">
          {last ? (
            <>
              <button
                className="btn primary"
                onClick={() => {
                  close();
                  onScan();
                }}
              >
                <Icon name="camera" size={18} /> {t("guide.start")}
              </button>
              <button className="btn" onClick={close}>
                {t("guide.later")}
              </button>
            </>
          ) : (
            <div className="row gap">
              {index > 0 && (
                <button className="btn" onClick={back} aria-label={t("common.back")}>
                  <Icon name="chevron-left" size={18} />
                </button>
              )}
              <button className="btn primary grow" onClick={next}>
                {index === 0 ? t("guide.letsGo") : t("guide.next")} <Icon name="chevron-right" size={18} />
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** The small picture under Lew's bubble for each step. */
function Art({ step }: { step: StepId }) {
  const { t, num } = useI18n();
  const { goals } = useAppState();

  switch (step) {
    case "scan":
      return (
        <div className="guide-art guide-scan">
          <div className="guide-viewfinder">
            <i />
            <i />
            <i />
            <i />
            <Icon name="soup" size={54} />
          </div>
          <div className="guide-result">
            <strong>520 kcal</strong>
            <span>
              <b className="dot protein" /> {t("abbr.protein")} 32g <b className="dot carbs" /> {t("abbr.carbs")} 62g <b className="dot fat" /> {t("abbr.fat")} 11g
            </span>
          </div>
        </div>
      );
    case "calories":
      return (
        <div className="guide-art guide-calories">
          <CalorieRing eaten={Math.round(goals.calories * 0.4)} goal={goals.calories} />
          <div className="guide-macros">
            <span>
              <b className="dot protein" /> {t("nutrient.protein")} <strong>{num(goals.protein)}g</strong>
            </span>
            <span>
              <b className="dot carbs" /> {t("nutrient.carbs")} <strong>{num(goals.carbs)}g</strong>
            </span>
            <span>
              <b className="dot fat" /> {t("nutrient.fat")} <strong>{num(goals.fat)}g</strong>
            </span>
          </div>
        </div>
      );
    case "ways":
      return (
        <div className="guide-art guide-tiles">
          <Tile icon="camera" label={t("guide.ways.photo")} />
          <Tile icon="pen" label={t("guide.ways.describe")} />
          <Tile icon="barcode" label={t("guide.ways.barcode")} />
          <Tile icon="menu" label={t("guide.ways.menu")} />
        </div>
      );
    case "lew":
      return (
        <div className="guide-art guide-chat">
          <p className="guide-msg me">{t("guide.lew.q")}</p>
          <div className="guide-msg-row">
            <Lew pose="wave" size={34} />
            <p className="guide-msg">{t("guide.lew.a")}</p>
          </div>
          <div className="guide-chips">
            <span>
              <Icon name="calendar" size={14} /> {t("guide.lew.plans")}
            </span>
            <span>
              <Icon name="trend-up" size={14} /> {t("guide.lew.report")}
            </span>
          </div>
        </div>
      );
    case "habits":
      return (
        <div className="guide-art guide-habits">
          <div className="guide-streak">
            <Icon name="flame" size={30} />
            <strong>7</strong>
            <span>{t("guide.habits.days")}</span>
          </div>
          <div className="guide-chips">
            <span>
              <Icon name="medal" size={14} /> {t("guide.habits.badges")}
            </span>
            <span>
              <Icon name="trophy" size={14} /> {t("guide.habits.leaderboard")}
            </span>
            <span>
              <Icon name="bell" size={14} /> {t("guide.habits.reminders")}
            </span>
          </div>
        </div>
      );
    default:
      return null;
  }
}

function Tile({ icon, label }: { icon: IconName; label: string }): ReactNode {
  return (
    <span className="guide-tile">
      <Icon name={icon} size={22} />
      <span>{label}</span>
    </span>
  );
}

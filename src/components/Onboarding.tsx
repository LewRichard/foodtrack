import { useState, type ReactNode } from "react";
import { bmr, goalsFromProfile, tdee, type Activity, type GoalType, type Profile, type Sex } from "../../shared/nutrition.ts";
import { useI18n, type MessageKey } from "../i18n/index.ts";
import { todayKey } from "../lib/dates.ts";
import { actions, useAppState } from "../lib/store.ts";

type Step = "name" | "sex" | "age" | "body" | "goal" | "activity" | "result";
const STEPS: Step[] = ["name", "sex", "age", "body", "goal", "activity", "result"];

const ACTIVITIES: { id: Activity; icon: string; label: MessageKey; hint: MessageKey }[] = [
  { id: "sedentary", icon: "🪑", label: "onb.act.sedentary", hint: "onb.act.sedentaryHint" },
  { id: "light", icon: "🚶", label: "onb.act.light", hint: "onb.act.lightHint" },
  { id: "moderate", icon: "🏃", label: "onb.act.moderate", hint: "onb.act.moderateHint" },
  { id: "active", icon: "🏋️", label: "onb.act.active", hint: "onb.act.activeHint" },
  { id: "very_active", icon: "🔥", label: "onb.act.veryActive", hint: "onb.act.veryActiveHint" },
];

const GOALS: { id: GoalType; icon: string; label: MessageKey; hint: MessageKey }[] = [
  { id: "lose", icon: "📉", label: "onb.goal.lose", hint: "onb.goal.loseHint" },
  { id: "maintain", icon: "⚖️", label: "onb.goal.maintain", hint: "onb.goal.maintainHint" },
  { id: "gain", icon: "💪", label: "onb.goal.gain", hint: "onb.goal.gainHint" },
];

const num = (s: string) => Number(s.replace(",", "."));

/** A few questions for new accounts; the answers set calorie and nutrient goals. */
export default function Onboarding() {
  const { t, num: fmt } = useI18n();
  const state = useAppState();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(state.name);
  const [sex, setSex] = useState<Sex | null>(null);
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [goal, setGoal] = useState<GoalType | null>(null);
  const [target, setTarget] = useState("");
  const [activity, setActivity] = useState<Activity | null>(null);

  const current = STEPS[step];
  const ageN = num(age);
  const heightN = num(height);
  const weightN = num(weight);
  const targetN = num(target);
  const validTarget =
    goal === "maintain" ||
    !target.trim() ||
    (targetN >= 20 && targetN <= 400 && (goal === "lose" ? targetN < weightN : targetN > weightN));

  const valid: Record<Step, boolean> = {
    name: true,
    sex: sex !== null,
    age: ageN >= 13 && ageN <= 100,
    body: heightN >= 100 && heightN <= 250 && weightN >= 25 && weightN <= 400,
    goal: goal !== null && validTarget,
    activity: activity !== null,
    result: true,
  };

  const profile: Profile | null =
    sex && goal && activity && valid.age && valid.body
      ? { sex, age: Math.round(ageN), heightCm: Math.round(heightN), weightKg: Math.round(weightN * 10) / 10, activity, goal }
      : null;
  const goals = profile ? goalsFromProfile(profile) : null;

  function next() {
    if (current === "result" && profile && goals) {
      actions.completeOnboarding({
        name,
        profile,
        goals,
        targetWeight: goal !== "maintain" && target.trim() ? Math.round(targetN * 10) / 10 : null,
        today: todayKey(),
      });
      return;
    }
    if (valid[current]) setStep(step + 1);
  }

  const choices = <T extends string>(items: { id: T; icon: string; label: MessageKey; hint?: MessageKey }[], value: T | null, set: (v: T) => void) => (
    <div className="onb-choices" role="radiogroup">
      {items.map((item) => (
        <button key={item.id} role="radio" aria-checked={value === item.id} className={`onb-choice ${value === item.id ? "active" : ""}`} onClick={() => set(item.id)}>
          <span className="onb-choice-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span>
            <strong>{t(item.label)}</strong>
            {item.hint && <span className="muted small">{t(item.hint)}</span>}
          </span>
        </button>
      ))}
    </div>
  );

  let body: ReactNode;
  switch (current) {
    case "name":
      body = (
        <Question title={t("onb.nameTitle")} subtitle={t("onb.nameBody")}>
          <input className="onb-big-input" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder={t("onb.namePlaceholder")} autoFocus autoComplete="given-name" />
        </Question>
      );
      break;
    case "sex":
      body = (
        <Question title={t("onb.sexTitle")} subtitle={t("onb.sexBody")}>
          {choices(
            [
              { id: "female" as Sex, icon: "👩", label: "goals.female" },
              { id: "male" as Sex, icon: "👨", label: "goals.male" },
            ],
            sex,
            setSex,
          )}
        </Question>
      );
      break;
    case "age":
      body = (
        <Question title={t("onb.ageTitle")}>
          <NumberField value={age} onChange={setAge} unit={t("onb.years")} min={13} max={100} step={1} />
        </Question>
      );
      break;
    case "body":
      body = (
        <Question title={t("onb.bodyTitle")} subtitle={t("onb.bodyBody")}>
          <label className="stack">
            <span className="label">{t("onb.height")}</span>
            <NumberField value={height} onChange={setHeight} unit="cm" min={100} max={250} step={1} />
          </label>
          <label className="stack">
            <span className="label">{t("onb.weight")}</span>
            <NumberField value={weight} onChange={setWeight} unit="kg" min={25} max={400} step={0.1} />
          </label>
        </Question>
      );
      break;
    case "goal":
      body = (
        <Question title={t("onb.goalTitle")}>
          {choices(GOALS, goal, setGoal)}
          {goal && goal !== "maintain" && (
            <label className="stack">
              <span className="label">{t("onb.target")}</span>
              <NumberField value={target} onChange={setTarget} unit="kg" min={20} max={400} step={0.1} placeholder={t("onb.optional")} />
              {!validTarget && <span className="error small">{goal === "lose" ? t("onb.targetLower") : t("onb.targetHigher")}</span>}
            </label>
          )}
        </Question>
      );
      break;
    case "activity":
      body = <Question title={t("onb.activityTitle")}>{choices(ACTIVITIES, activity, setActivity)}</Question>;
      break;
    case "result":
      body =
        profile && goals ? (
          <Question title={t("onb.resultTitle", { name: name.trim() || "👋" })} subtitle={t("onb.resultBody")}>
            <div className="onb-result">
              <span className="muted small">{t("onb.dailyCalories")}</span>
              <strong className="onb-kcal">{fmt(goals.calories)}</strong>
              <span className="muted small">kcal</span>
            </div>
            <div className="onb-macros">
              <span>
                <strong>{goals.protein} g</strong>
                <span className="muted small">{t("nutrient.protein")}</span>
              </span>
              <span>
                <strong>{goals.carbs} g</strong>
                <span className="muted small">{t("nutrient.carbs")}</span>
              </span>
              <span>
                <strong>{goals.fat} g</strong>
                <span className="muted small">{t("nutrient.fat")}</span>
              </span>
            </div>
            <p className="muted small">
              {t("onb.resultExplain", { bmr: fmt(Math.round(bmr(profile))), tdee: fmt(Math.round(tdee(profile))) })}
            </p>
          </Question>
        ) : null;
      break;
  }

  return (
    <div className="onboarding">
      <div className="onb-top">
        {step > 0 ? (
          <button className="icon-btn" onClick={() => setStep(step - 1)} aria-label={t("common.back")}>
            ‹
          </button>
        ) : (
          <span className="icon-btn-spacer" />
        )}
        <div className="onb-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}>
          <div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
        <button className="link small" onClick={() => actions.skipOnboarding()}>
          {t("onb.skip")}
        </button>
      </div>
      <div className="onb-body">{body}</div>
      <div className="onb-actions">
        <button className="btn primary onb-next" disabled={!valid[current]} onClick={next}>
          {current === "result" ? t("onb.start") : t("onb.continue")}
        </button>
      </div>
    </div>
  );
}

function Question({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="onb-question">
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
      <div className="stack onb-fields">{children}</div>
    </section>
  );
}

function NumberField({
  value,
  onChange,
  unit,
  min,
  max,
  step,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  min: number;
  max: number;
  step: number;
  placeholder?: string;
}) {
  return (
    <div className="onb-number">
      <input
        type="number"
        inputMode={step < 1 ? "decimal" : "numeric"}
        min={min}
        max={max}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <span>{unit}</span>
    </div>
  );
}

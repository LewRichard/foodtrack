import { useState } from "react";
import {
  bmr,
  goalsFromProfile,
  tdee,
  type Activity,
  type GoalType,
  type Goals,
  type Profile,
} from "../../shared/nutrition.ts";
import { useI18n, type MessageKey } from "../i18n/index.ts";
import { actions, useAppState } from "../lib/store.ts";

const ACTIVITIES: Activity[] = ["sedentary", "light", "moderate", "active", "very_active"];
const GOAL_TYPES: GoalType[] = ["lose", "maintain", "gain"];

const GOAL_FIELDS: { key: keyof Goals; label: MessageKey; unit: string }[] = [
  { key: "calories", label: "nutrient.calories", unit: "kcal" },
  { key: "protein", label: "nutrient.protein", unit: "g" },
  { key: "carbs", label: "nutrient.carbs", unit: "g" },
  { key: "fat", label: "nutrient.fat", unit: "g" },
  { key: "fiber", label: "nutrient.fiberMin", unit: "g" },
  { key: "sugar", label: "nutrient.sugarMax", unit: "g" },
  { key: "sodium", label: "nutrient.sodiumMax", unit: "mg" },
];

const DEFAULT_PROFILE: Profile = { sex: "female", age: 30, heightCm: 168, weightKg: 68, activity: "light", goal: "maintain" };

export default function Goals() {
  const { goals, profile: savedProfile } = useAppState();
  const { t, num } = useI18n();
  const [profile, setProfile] = useState<Profile>(savedProfile ?? DEFAULT_PROFILE);
  const [goalDraft, setGoalDraft] = useState<Goals>(goals);
  const [saved, setSaved] = useState(false);
  const valid = profile.age > 0 && profile.heightCm > 0 && profile.weightKg > 0;
  const suggested = valid ? goalsFromProfile(profile) : null;

  const parse = (v: string) => (v === "" ? 0 : Number(v));

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function applySuggested() {
    if (!suggested) return;
    actions.setProfile(profile);
    actions.setGoals(suggested);
    setGoalDraft(suggested);
    flash();
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>{t("goals.title")}</h1>
        <p className="muted">{t("goals.subtitle")}</p>
      </header>

      <section className="card">
        <h2 className="title">{t("goals.calcTitle")}</h2>
        <div className="field-grid">
          <label>
            <span>{t("goals.sex")}</span>
            <select value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value as Profile["sex"] })}>
              <option value="female">{t("goals.female")}</option>
              <option value="male">{t("goals.male")}</option>
            </select>
          </label>
          <label>
            <span>{t("goals.age")}</span>
            <input type="number" inputMode="numeric" value={profile.age || ""} onChange={(e) => setProfile({ ...profile, age: parse(e.target.value) })} />
          </label>
          <label>
            <span>{t("goals.height")}</span>
            <input type="number" inputMode="decimal" value={profile.heightCm || ""} onChange={(e) => setProfile({ ...profile, heightCm: parse(e.target.value) })} />
          </label>
          <label>
            <span>{t("goals.weight")}</span>
            <input type="number" inputMode="decimal" value={profile.weightKg || ""} onChange={(e) => setProfile({ ...profile, weightKg: parse(e.target.value) })} />
          </label>
          <label className="span-2">
            <span>{t("goals.activity")}</span>
            <select value={profile.activity} onChange={(e) => setProfile({ ...profile, activity: e.target.value as Activity })}>
              {ACTIVITIES.map((a) => (
                <option key={a} value={a}>
                  {t(`activity.${a}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="segmented">
          {GOAL_TYPES.map((g) => (
            <button key={g} className={g === profile.goal ? "active" : ""} onClick={() => setProfile({ ...profile, goal: g })}>
              {t(`goal.${g}`)}
            </button>
          ))}
        </div>
        {suggested && (
          <p className="muted small">
            {t("goals.suggestion", {
              bmr: num(bmr(profile)),
              tdee: num(tdee(profile)),
              kcal: num(suggested.calories),
              protein: suggested.protein,
              carbs: suggested.carbs,
              fat: suggested.fat,
            })}
          </p>
        )}
        <button className="btn primary" disabled={!suggested} onClick={applySuggested}>
          {t("goals.use")}
        </button>
      </section>

      <section className="card">
        <h2 className="title">{t("goals.targets")}</h2>
        <div className="field-grid">
          {GOAL_FIELDS.map((f) => (
            <label key={f.key}>
              <span>
                {t(f.label)} ({f.unit})
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={goalDraft[f.key] || ""}
                onChange={(e) => setGoalDraft({ ...goalDraft, [f.key]: parse(e.target.value) })}
              />
            </label>
          ))}
        </div>
        <button
          className="btn primary"
          onClick={() => {
            actions.setGoals(goalDraft);
            flash();
          }}
        >
          {saved ? t("common.saved") : t("goals.saveTargets")}
        </button>
      </section>

    </div>
  );
}

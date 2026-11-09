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
import { actions, useAppState } from "../lib/store.ts";

const ACTIVITY_LABELS: Record<Activity, string> = {
  sedentary: "Sedentary (little exercise)",
  light: "Light (1–3 days/week)",
  moderate: "Moderate (3–5 days/week)",
  active: "Active (6–7 days/week)",
  very_active: "Very active (physical job)",
};

const GOAL_LABELS: Record<GoalType, string> = { lose: "Lose weight", maintain: "Maintain", gain: "Gain muscle" };

const GOAL_FIELDS: { key: keyof Goals; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "fiber", label: "Fiber (min)", unit: "g" },
  { key: "sugar", label: "Sugar (max)", unit: "g" },
  { key: "sodium", label: "Sodium (max)", unit: "mg" },
];

const DEFAULT_PROFILE: Profile = { sex: "female", age: 30, heightCm: 168, weightKg: 68, activity: "light", goal: "maintain" };

export default function Goals() {
  const { goals, profile: savedProfile } = useAppState();
  const [profile, setProfile] = useState<Profile>(savedProfile ?? DEFAULT_PROFILE);
  const [goalDraft, setGoalDraft] = useState<Goals>(goals);
  const [saved, setSaved] = useState(false);
  const valid = profile.age > 0 && profile.heightCm > 0 && profile.weightKg > 0;
  const suggested = valid ? goalsFromProfile(profile) : null;

  const num = (v: string) => (v === "" ? 0 : Number(v));

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
        <h1>Goals</h1>
        <p className="muted">Your daily targets for calories and nutrients.</p>
      </header>

      <section className="card">
        <h2 className="title">Calculate from your profile</h2>
        <div className="field-grid">
          <label>
            <span>Sex</span>
            <select value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value as Profile["sex"] })}>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </label>
          <label>
            <span>Age</span>
            <input type="number" inputMode="numeric" value={profile.age || ""} onChange={(e) => setProfile({ ...profile, age: num(e.target.value) })} />
          </label>
          <label>
            <span>Height (cm)</span>
            <input type="number" inputMode="decimal" value={profile.heightCm || ""} onChange={(e) => setProfile({ ...profile, heightCm: num(e.target.value) })} />
          </label>
          <label>
            <span>Weight (kg)</span>
            <input type="number" inputMode="decimal" value={profile.weightKg || ""} onChange={(e) => setProfile({ ...profile, weightKg: num(e.target.value) })} />
          </label>
          <label className="span-2">
            <span>Activity</span>
            <select value={profile.activity} onChange={(e) => setProfile({ ...profile, activity: e.target.value as Activity })}>
              {Object.entries(ACTIVITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="segmented">
          {(Object.keys(GOAL_LABELS) as GoalType[]).map((g) => (
            <button key={g} className={g === profile.goal ? "active" : ""} onClick={() => setProfile({ ...profile, goal: g })}>
              {GOAL_LABELS[g]}
            </button>
          ))}
        </div>
        {suggested && (
          <p className="muted small">
            BMR {Math.round(bmr(profile)).toLocaleString("en-US")} kcal · TDEE {Math.round(tdee(profile)).toLocaleString("en-US")} kcal →{" "}
            <b>{suggested.calories.toLocaleString("en-US")} kcal</b>, {suggested.protein} g protein, {suggested.carbs} g carbs,{" "}
            {suggested.fat} g fat
          </p>
        )}
        <button className="btn primary" disabled={!suggested} onClick={applySuggested}>
          Use these goals
        </button>
      </section>

      <section className="card">
        <h2 className="title">Daily targets</h2>
        <div className="field-grid">
          {GOAL_FIELDS.map((f) => (
            <label key={f.key}>
              <span>
                {f.label} ({f.unit})
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={goalDraft[f.key] || ""}
                onChange={(e) => setGoalDraft({ ...goalDraft, [f.key]: num(e.target.value) })}
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
          {saved ? "Saved ✓" : "Save targets"}
        </button>
      </section>

    </div>
  );
}

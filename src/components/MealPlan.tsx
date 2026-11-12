import { useEffect, useRef, useState } from "react";
import { dayCalories, PLAN_LENGTHS, type PlanLength, type PlanMeal } from "../../shared/mealplan.ts";
import { sumNutrients } from "../../shared/nutrition.ts";
import { useI18n } from "../i18n/index.ts";
import { errorMessage, fetchMealPlan, isPremiumError, isSignInError } from "../lib/api.ts";
import { timeAgo, todayKey } from "../lib/dates.ts";
import { actions, getState, newId, useAppState } from "../lib/store.ts";
import { MEAL_ICONS } from "../lib/types.ts";
import { Icon } from "./Icon.tsx";
import { isLocked, openPaywall, usePlan } from "../lib/plan.ts";
import { PremiumLock } from "./Premium.tsx";
import { Lew } from "./Lew.tsx";

/** Foods the person logs most, so the plan stays close to what they actually eat. */
function usualFoods(): string[] {
  const counts = new Map<string, number>();
  for (const e of getState().entries.slice(-300)) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name]) => name.slice(0, 120));
}

/** AI meal plan and shopping list. */
export default function MealPlanScreen({ onBack, onSignIn }: { onBack: () => void; onSignIn: () => void }) {
  const { t, tp, locale } = useI18n();
  const { mealPlan } = useAppState();
  const [composing, setComposing] = useState(!mealPlan);
  const locked = isLocked(usePlan());
  const [view, setView] = useState<"menu" | "shopping">("menu");
  const [day, setDay] = useState(0);

  useEffect(() => {
    if (!mealPlan) setComposing(true);
  }, [mealPlan]);

  return (
    <div className="page plan">
      <header className="coach-head">
        <button className="icon-btn" onClick={composing && mealPlan ? () => setComposing(false) : onBack} aria-label={t("common.back")}>
          <Icon name="chevron-left" size={22} />
        </button>
        <span className="coach-avatar" aria-hidden="true">
          <Icon name="calendar" />
        </span>
        <div className="coach-title">
          <strong>{t("plan.title")}</strong>
          <span className="muted small">{t("plan.subtitle")}</span>
        </div>
      </header>

      {locked && (composing || !mealPlan) ? (
        <PremiumLock title={t("premium.planTitle")} body={t("premium.planBody")} />
      ) : composing || !mealPlan ? (
        <PlanForm
          onSignIn={onSignIn}
          onDone={() => {
            setComposing(false);
            setView("menu");
            setDay(0);
          }}
        />
      ) : (
        <>
          <section className="card plan-summary">
            <div className="row between">
              <h2 className="title">{mealPlan.plan.title || t("plan.title")}</h2>
              <span className="muted tiny">{timeAgo(mealPlan.createdAt, locale)}</span>
            </div>
            <p className="muted small">
              {tp("plan.days", mealPlan.plan.days.length)}
              {mealPlan.preferences && ` · ${mealPlan.preferences}`}
            </p>
            <button className="link small" onClick={() => setComposing(true)}>
              {t("plan.new")}
            </button>
          </section>

          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={view === "menu"} className={view === "menu" ? "active" : ""} onClick={() => setView("menu")}>
              {t("plan.menu")}
            </button>
            <button role="tab" aria-selected={view === "shopping"} className={view === "shopping" ? "active" : ""} onClick={() => setView("shopping")}>
              {t("plan.shopping")}
            </button>
          </div>

          {view === "menu" ? <Menu day={Math.min(day, mealPlan.plan.days.length - 1)} setDay={setDay} /> : <Shopping />}
        </>
      )}
      <p className="muted tiny center">{t("coach.disclaimer")}</p>
    </div>
  );
}

function PlanForm({ onDone, onSignIn }: { onDone: () => void; onSignIn: () => void }) {
  const { t, tp, lang, num } = useI18n();
  const { mealPlan, goals } = useAppState();
  const [length, setLength] = useState<PlanLength>(mealPlan?.length ?? 3);
  const [preferences, setPreferences] = useState(mealPlan?.preferences ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; signIn: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function create() {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const s = getState();
      const prefs = preferences.trim();
      const plan = await fetchMealPlan(
        { days: length, preferences: prefs, goals: s.goals, profile: s.profile, usualFoods: usualFoods() },
        lang,
        controller.signal,
      );
      actions.setMealPlan({ createdAt: Date.now(), length, preferences: prefs, plan, checked: [], added: [] });
      onDone();
    } catch (e) {
      if (!controller.signal.aborted) {
        setError({ text: errorMessage(e), signIn: isSignInError(e) });
        if (isPremiumError(e)) openPaywall("feature");
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <section className="card stack">
      <div className="lew-inline">
        <Lew pose="think" size={52} />
        <p className="small">{t("plan.intro", { kcal: num(goals.calories), protein: num(goals.protein) })}</p>
      </div>
      <div>
        <span className="label">{t("plan.length")}</span>
        <div className="segmented">
          {PLAN_LENGTHS.map((n) => (
            <button key={n} className={length === n ? "active" : ""} onClick={() => setLength(n)} disabled={busy}>
              {tp("plan.days", n)}
            </button>
          ))}
        </div>
      </div>
      <label className="stack">
        <span className="label">{t("plan.preferences")}</span>
        <textarea
          rows={3}
          value={preferences}
          maxLength={300}
          disabled={busy}
          onChange={(e) => setPreferences(e.target.value)}
          placeholder={t("plan.preferencesHint")}
        />
      </label>
      {busy ? (
        <>
          <p className="plan-writing small">
            <span className="typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>{" "}
            {t("plan.writing")}
          </p>
          <button className="btn" onClick={() => abortRef.current?.abort()}>
            {t("common.cancel")}
          </button>
        </>
      ) : (
        <button className="btn primary" onClick={() => void create()}>
          <Icon name="sparkles" size={18} /> {t("plan.create")}
        </button>
      )}
      {error && (
        <div className="stack">
          <p className="error small" role="alert">
            {error.text}
          </p>
          {error.signIn && (
            <button className="btn small-btn" onClick={onSignIn}>
              {t("scan.signInAction")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Menu({ day, setDay }: { day: number; setDay: (d: number) => void }) {
  const { t, num } = useI18n();
  const { mealPlan, goals } = useAppState();
  if (!mealPlan) return null;
  const { plan, added } = mealPlan;
  const current = plan.days[day];
  const total = sumNutrients(current.meals);
  const keyOf = (i: number) => `${day}:${i}`;
  const pending = current.meals.map((_, i) => i).filter((i) => !added.includes(keyOf(i)));

  function addMeals(indexes: number[]) {
    const now = Date.now();
    const date = todayKey();
    actions.addEntries(
      indexes.map((i, k) => {
        const m = current.meals[i];
        return {
          id: newId(),
          date,
          meal: m.meal,
          loggedAt: now + k,
          source: "manual" as const,
          name: m.name,
          portion: m.portion,
          grams: m.grams,
          calories: m.calories,
          protein: m.protein,
          carbs: m.carbs,
          fat: m.fat,
          fiber: m.fiber,
          sugar: m.sugar,
          sodium: m.sodium,
          confidence: "medium" as const,
        };
      }),
    );
    for (const i of indexes) actions.togglePlanMark("added", keyOf(i), true);
  }

  return (
    <>
      {plan.days.length > 1 && (
        <div className="plan-days" role="tablist">
          {plan.days.map((_, i) => (
            <button key={i} role="tab" aria-selected={i === day} className={`chip-btn ${i === day ? "active" : ""}`} onClick={() => setDay(i)}>
              {t("plan.day", { n: i + 1 })}
            </button>
          ))}
        </div>
      )}

      <section className="card plan-total">
        <div>
          <strong>{num(dayCalories(current))}</strong> <span className="muted small">/ {num(goals.calories)} kcal</span>
        </div>
        <span className="muted small">
          {t("nutrient.protein")} {Math.round(total.protein)} g · {t("nutrient.carbs")} {Math.round(total.carbs)} g · {t("nutrient.fat")} {Math.round(total.fat)} g
        </span>
        {pending.length > 0 && (
          <button className="btn small-btn" onClick={() => addMeals(pending)}>
            {t("plan.addDay")}
          </button>
        )}
      </section>

      {current.meals.map((m, i) => (
        <PlannedMeal key={`${day}-${i}`} meal={m} added={added.includes(keyOf(i))} onAdd={() => addMeals([i])} />
      ))}

      {plan.tips.length > 0 && (
        <section className="card">
          <h2 className="title">{t("plan.tips")}</h2>
          <ul className="plan-tips">
            {plan.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function PlannedMeal({ meal, added, onAdd }: { meal: PlanMeal; added: boolean; onAdd: () => void }) {
  const { t, num } = useI18n();
  return (
    <section className="card plan-meal">
      <div className="row between">
        <span className="label">
          <Icon name={MEAL_ICONS[meal.meal]} size={14} /> {t(`meal.${meal.meal}`)}
        </span>
        <strong className="plan-kcal">{num(meal.calories)} kcal</strong>
      </div>
      <h3>{meal.name}</h3>
      <p className="muted small">
        {meal.portion}
        {meal.grams > 0 && ` (${num(meal.grams)} g)`} · {t("nutrient.protein")} {Math.round(meal.protein)} g · {t("nutrient.carbs")} {Math.round(meal.carbs)} g ·{" "}
        {t("nutrient.fat")} {Math.round(meal.fat)} g
      </p>
      {meal.recipe && <p className="small">{meal.recipe}</p>}
      <button className={`btn small-btn ${added ? "" : "primary"}`} disabled={added} onClick={onAdd}>
        <Icon name={added ? "check" : "plus"} size={16} strokeWidth={2} /> {added ? t("plan.added") : t("plan.addToday")}
      </button>
    </section>
  );
}

function Shopping() {
  const { t } = useI18n();
  const { mealPlan } = useAppState();
  const [copied, setCopied] = useState(false);
  if (!mealPlan) return null;
  const { shopping } = mealPlan.plan;
  const checked = new Set(mealPlan.checked);
  const all = shopping.flatMap((g, gi) => g.items.map((_, ii) => `${gi}:${ii}`));
  const done = all.filter((k) => checked.has(k)).length;

  async function copy() {
    const text = shopping
      .map((g, gi) => {
        const items = g.items.filter((_, ii) => !checked.has(`${gi}:${ii}`)).map((i) => `- ${i.name}${i.amount ? ` (${i.amount})` : ""}`);
        return items.length ? `${g.category}\n${items.join("\n")}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
    try {
      if (navigator.share && /iPhone|iPad|Android/i.test(navigator.userAgent)) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Cancelled or blocked: nothing to do.
    }
  }

  return (
    <>
      <div className="row between">
        <span className="muted small">{t("plan.bought", { done, total: all.length })}</span>
        <button className="link small" onClick={() => void copy()}>
          {copied ? t("plan.copied") : t("plan.copy")}
        </button>
      </div>
      {shopping.map((g, gi) => (
        <section className="card plan-shop" key={gi}>
          <h2 className="title">{g.category}</h2>
          {g.items.map((item, ii) => {
            const key = `${gi}:${ii}`;
            const on = checked.has(key);
            return (
              <label key={key} className={`check plan-item ${on ? "done" : ""}`}>
                <input type="checkbox" checked={on} onChange={(e) => actions.togglePlanMark("checked", key, e.target.checked)} />
                <span className="plan-item-name">{item.name}</span>
                <span className="muted small">{item.amount}</span>
              </label>
            );
          })}
        </section>
      ))}
    </>
  );
}

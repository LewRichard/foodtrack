import { useState } from "react";
import { averageHealthScore, sumNutrients } from "../../shared/nutrition.ts";
import { useI18n } from "../i18n/index.ts";
import { formatLongDate, greetingKey, todayKey } from "../lib/dates.ts";
import { cloudEnabled, useSession } from "../lib/cloud.ts";
import { APPLE_HEALTH_ENABLED } from "../lib/health.ts";
import { actions, entriesForDate, useAppState, useSaveFailed } from "../lib/store.ts";
import {
  MEAL_ICONS,
  MEAL_TYPES,
  suggestedMealKcal,
  type LogEntry,
  type MealType,
} from "../lib/types.ts";
import AddFood from "./AddFood.tsx";
import { Icon, type IconName } from "./Icon.tsx";
import EditEntry from "./EditEntry.tsx";
import { CalorieRing, MacroCard, NutrientBar } from "./Progress.tsx";
import Sheet from "./Sheet.tsx";
import { HealthChip, ScoreRing, tierLabel } from "./HealthScore.tsx";
import ProfilePhoto from "./ProfilePhoto.tsx";
import { StreakChip } from "./Achievements.tsx";
import { LewToday } from "./LewCard.tsx";
import { streak } from "../lib/achievements.ts";
import { WeightTile } from "./Weight.tsx";
import WeekStrip from "./WeekStrip.tsx";
import { isLocked, usePlan } from "../lib/plan.ts";
import { PremiumTag } from "./Premium.tsx";

const GLASS_ML = 250;
const WATER_GOAL = 8;

export default function Today({
  date,
  onDateChange,
  onScan,
  onOpenProfile,
  onSeeAll,
  onOpenCoach,
  onOpenPlan,
}: {
  date: string;
  onDateChange: (d: string) => void;
  onScan: () => void;
  onOpenProfile: () => void;
  onSeeAll: () => void;
  onOpenCoach: () => void;
  onOpenPlan: () => void;
}) {
  const state = useAppState();
  const i18n = useI18n();
  const { t, num } = i18n;
  const saveFailed = useSaveFailed();
  const locked = isLocked(usePlan());
  const session = useSession();
  const { goals, name } = state;
  const entries = entriesForDate(state, date);
  const total = sumNutrients(entries);
  const dayScore = averageHealthScore(entries);
  const burned = state.burned[date] ?? 0;
  const water = state.water[date] ?? 0;
  const steps = APPLE_HEALTH_ENABLED && state.health.connected ? state.steps[date] : undefined;
  const [adding, setAdding] = useState<MealType | null>(null);
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [editingBurned, setEditingBurned] = useState(false);
  const loggedDates = new Set(state.entries.map((e) => e.date));
  const firstName = name.trim().split(/\s+/)[0];

  return (
    <div className="page today">
      <header className="hello">
        <div className="hello-text">
          {/* The date doubles as a date picker for days outside the week strip. */}
          <label className="hello-date">
            {formatLongDate(date, i18n)}
            <input
              type="date"
              value={date}
              max={todayKey()}
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
              aria-label={t("today.pickDate")}
            />
          </label>
          <h1>
            {firstName ? t("greet.withName", { greeting: t(greetingKey()), name: firstName }) : t(greetingKey())}
          </h1>
        </div>
        <div className="hello-actions">
          <StreakChip />
          <button className="avatar" onClick={onOpenProfile} aria-label={t("tab.profile")}>
            <ProfilePhoto fallback={firstName ? firstName[0].toUpperCase() : <PersonIcon />} />
          </button>
        </div>
      </header>

      {saveFailed && (
        <p className="save-warning" role="alert">
          {t("today.saveFailed")}
        </p>
      )}

      {cloudEnabled && !session && state.entries.length > 0 && (
        <button className="backup-banner" onClick={onOpenProfile}>
          <Icon name="cloud" />
          <span>
            <strong>{t("today.backupTitle")}</strong> {t("today.backupAction")}
          </span>
        </button>
      )}

      <WeekStrip date={date} onChange={onDateChange} hasEntries={(d) => loggedDates.has(d)} />

      <section className="card summary">
        <CalorieRing eaten={total.calories - burned} goal={goals.calories} />
        <div className="summary-stats">
          <Stat icon="target" label={t("today.goal")} value={goals.calories} />
          <Stat icon="utensils" label={t("today.eaten")} value={Math.round(total.calories)} />
          <Stat icon="flame" label={t("today.burned")} value={burned} onClick={() => setEditingBurned(true)} />
          {steps !== undefined && <Stat icon="footprints" label={t("today.steps")} value={steps} />}
        </div>
      </section>

      <LewToday
        facts={{
          isToday: date === todayKey(),
          hour: new Date().getHours(),
          entries: entries.length,
          total,
          burned,
          goals,
          streak: streak(state),
        }}
        onScan={onScan}
        onCoach={onOpenCoach}
      />

      <section className="macro-row">
        <MacroCard label={t("nutrient.protein")} value={total.protein} goal={goals.protein} color="var(--protein)" />
        <MacroCard label={t("nutrient.carbs")} value={total.carbs} goal={goals.carbs} color="var(--carbs)" />
        <MacroCard label={t("nutrient.fat")} value={total.fat} goal={goals.fat} color="var(--fat)" />
      </section>

      <button className="scan-banner" onClick={onScan}>
        <span className="scan-banner-icon" aria-hidden="true">
          <ScanIcon />
        </span>
        <span className="scan-banner-text">
          <strong>{t("today.scanTitle")}</strong>
          <span>{t("today.scanSubtitle")}</span>
        </span>
        <span className="scan-banner-go" aria-hidden="true">
          →
        </span>
      </button>

      <button className="card coach-banner" onClick={onOpenCoach}>
        <span className="coach-avatar" aria-hidden="true">
          <Icon name="sparkles" />
        </span>
        <span className="coach-banner-text">
          <strong>
            {t("coach.bannerTitle")} {locked && <PremiumTag />}
          </strong>
          <span className="muted small">{t("coach.bannerBody")}</span>
        </span>
        <Icon name="chevron-right" className="muted" />
      </button>

      <button className="card coach-banner" onClick={onOpenPlan}>
        <span className="coach-avatar" aria-hidden="true">
          <Icon name="calendar" />
        </span>
        <span className="coach-banner-text">
          <strong>
            {t("plan.bannerTitle")} {locked && <PremiumTag />}
          </strong>
          <span className="muted small">{state.mealPlan ? t("plan.bannerOpen") : t("plan.bannerBody")}</span>
        </span>
        <Icon name="chevron-right" className="muted" />
      </button>

      <div className="section-head">
        <h2>{date === todayKey() ? t("today.todaysMeals") : t("today.meals")}</h2>
        <button className="link" onClick={onSeeAll}>
          {t("today.seeAll")}
        </button>
      </div>
      {dayScore !== null && (
        <div className="day-score">
          <ScoreRing score={dayScore} size={40} />
          <span>
            <strong>{t("health.dayScore", { score: num(dayScore, 1) })}</strong>
            <span className="muted small"> · {t(tierLabel(dayScore))}</span>
          </span>
        </div>
      )}

      {MEAL_TYPES.map((meal) => {
        const items = entries.filter((e) => e.meal === meal);
        const kcal = Math.round(sumNutrients(items).calories);
        const suggested = suggestedMealKcal(meal, goals.calories);
        return (
          <section key={meal} className="card meal">
            <div className="meal-head">
              <span className={`tile tile-${meal}`} aria-hidden="true">
                <Icon name={MEAL_ICONS[meal]} />
              </span>
              <div className="meal-title">
                <h3>{t(`meal.${meal}`)}</h3>
                <span className="muted">
                  {items.length
                    ? t("today.mealProgress", { eaten: num(kcal), suggested: num(suggested) })
                    : t("today.mealSuggested", { kcal: num(suggested) })}
                </span>
              </div>
              <button className="plus-btn" onClick={() => setAdding(meal)} aria-label={t("today.addFoodTo", { meal: t(`meal.${meal}`) })}>
                <Icon name="plus" size={18} strokeWidth={2} />
              </button>
            </div>
            {items.map((e) => (
              <button key={e.id} className="entry" onClick={() => setEditing(e)}>
                {e.photo && <img src={e.photo} alt="" className="thumb" />}
                <span className="entry-main">
                  <span className="entry-name">
                    {e.name}
                    {/* A scan's score belongs to the whole meal: show it once, on the item with the photo. */}
                    {e.healthScore && (e.photo || e.source !== "scan") ? <HealthChip score={e.healthScore} /> : null}
                  </span>
                  <span className="muted small">
                    {e.portion}
                    {e.grams ? ` · ${Math.round(e.grams)}g` : ""}
                  </span>
                </span>
                <span className="entry-kcal">{Math.round(e.calories)}</span>
              </button>
            ))}
          </section>
        );
      })}

      <section className="card meal">
        <div className="meal-head">
          <span className="tile tile-water" aria-hidden="true">
            <Icon name="droplet" />
          </span>
          <div className="meal-title">
            <h3>{t("today.water")}</h3>
            <span className="muted">{t("today.waterStatus", { n: water, goal: WATER_GOAL, ml: num(water * GLASS_ML) })}</span>
          </div>
          <button className="plus-btn" onClick={() => actions.setWater(date, water + 1)} aria-label={t("today.addWater")}>
            <Icon name="plus" size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="water">
          {Array.from({ length: Math.max(WATER_GOAL, water) }, (_, i) => (
            <button
              key={i}
              className={`glass ${i < water ? "full" : ""}`}
              onClick={() => actions.setWater(date, i < water ? i : i + 1)}
              aria-label={i < water ? t("today.removeGlass", { n: i + 1 }) : t("today.fillGlasses", { n: i + 1 })}
            />
          ))}
        </div>
      </section>

      <WeightTile date={date} />

      <details className="card more">
        <summary>{t("today.moreNutrients")}</summary>
        <NutrientBar label={t("nutrient.fiber")} value={total.fiber} goal={goals.fiber} unit="g" color="var(--neutral-fill)" />
        <NutrientBar label={t("nutrient.sugar")} value={total.sugar} goal={goals.sugar} unit="g" color="var(--neutral-fill)" limit />
        <NutrientBar label={t("nutrient.sodium")} value={total.sodium} goal={goals.sodium} unit="mg" color="var(--neutral-fill)" limit />
      </details>

      {adding && <AddFood date={date} meal={adding} onClose={() => setAdding(null)} />}
      {editing && <EditEntry entry={editing} onClose={() => setEditing(null)} />}
      {editingBurned && <BurnedSheet date={date} value={burned} onClose={() => setEditingBurned(false)} />}
    </div>
  );
}

function Stat({ icon, label, value, onClick }: { icon: IconName; label: string; value: number; onClick?: () => void }) {
  const { t, num } = useI18n();
  const body = (
    <>
      <span className="kpi-icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <span className="kpi-text">
        <span className="kpi-label">{label}</span>
        <strong>{num(value)}</strong>
      </span>
    </>
  );
  return onClick ? (
    <button className="kpi" onClick={onClick} aria-label={t("today.editStat", { label, value: num(value) })}>
      {body}
    </button>
  ) : (
    <div className="kpi">{body}</div>
  );
}

function BurnedSheet({ date, value, onClose }: { date: string; value: number; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { health } = useAppState();
  const [kcal, setKcal] = useState(value ? String(value) : "");
  const add = (n: number) => setKcal(String((Number(kcal) || 0) + n));
  return (
    <Sheet title={t("burned.title")} onClose={onClose}>
      <p className="muted small">{t("burned.help", { date: formatLongDate(date, i18n) })}</p>
      {APPLE_HEALTH_ENABLED && health.connected && <p className="muted small">{t("burned.fromHealth")}</p>}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        placeholder={t("burned.placeholder")}
        value={kcal}
        onChange={(e) => setKcal(e.target.value)}
        autoFocus
      />
      <div className="row gap wrap">
        {[100, 200, 300].map((n) => (
          <button key={n} className="btn" onClick={() => add(n)}>
            +{n}
          </button>
        ))}
      </div>
      <button
        className="btn primary"
        onClick={() => {
          actions.setBurned(date, Number(kcal) || 0);
          onClose();
        }}
      >
        {t("common.save")}
      </button>
    </Sheet>
  );
}

export function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

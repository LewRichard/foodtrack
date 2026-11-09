import { useState } from "react";
import { sumNutrients } from "../../shared/nutrition.ts";
import { formatLongDate, greeting, todayKey } from "../lib/dates.ts";
import { actions, entriesForDate, useAppState } from "../lib/store.ts";
import {
  MEAL_ICONS,
  MEAL_LABELS,
  MEAL_TYPES,
  suggestedMealKcal,
  type LogEntry,
  type MealType,
} from "../lib/types.ts";
import AddFood from "./AddFood.tsx";
import EditEntry from "./EditEntry.tsx";
import { CalorieRing, MacroCard, NutrientBar } from "./Progress.tsx";
import Sheet from "./Sheet.tsx";
import WeekStrip from "./WeekStrip.tsx";

const GLASS_ML = 250;
const WATER_GOAL = 8;

export default function Today({
  date,
  onDateChange,
  onScan,
  onOpenProfile,
  onSeeAll,
}: {
  date: string;
  onDateChange: (d: string) => void;
  onScan: () => void;
  onOpenProfile: () => void;
  onSeeAll: () => void;
}) {
  const state = useAppState();
  const { goals, name } = state;
  const entries = entriesForDate(state, date);
  const total = sumNutrients(entries);
  const burned = state.burned[date] ?? 0;
  const water = state.water[date] ?? 0;
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
            {formatLongDate(date)}
            <input
              type="date"
              value={date}
              max={todayKey()}
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
              aria-label="Pick a date"
            />
          </label>
          <h1>
            {greeting()}
            {firstName ? `, ${firstName}` : ""} <span aria-hidden="true">👋</span>
          </h1>
        </div>
        <button className="avatar" onClick={onOpenProfile} aria-label="Profile">
          {firstName ? firstName[0].toUpperCase() : <PersonIcon />}
        </button>
      </header>

      <WeekStrip date={date} onChange={onDateChange} hasEntries={(d) => loggedDates.has(d)} />

      <section className="card summary">
        <CalorieRing eaten={total.calories - burned} goal={goals.calories} />
        <div className="summary-stats">
          <Stat icon="🎯" label="Goal" value={goals.calories} />
          <Stat icon="🍽️" label="Eaten" value={Math.round(total.calories)} />
          <Stat icon="🔥" label="Burned" value={burned} onClick={() => setEditingBurned(true)} />
        </div>
      </section>

      <section className="macro-row">
        <MacroCard label="Protein" value={total.protein} goal={goals.protein} color="var(--protein)" />
        <MacroCard label="Carbs" value={total.carbs} goal={goals.carbs} color="var(--carbs)" />
        <MacroCard label="Fat" value={total.fat} goal={goals.fat} color="var(--fat)" />
      </section>

      <button className="scan-banner" onClick={onScan}>
        <span className="scan-banner-icon" aria-hidden="true">
          <ScanIcon />
        </span>
        <span className="scan-banner-text">
          <strong>Scan a meal with AI</strong>
          <span>Photo → calories &amp; macros</span>
        </span>
        <span className="scan-banner-go" aria-hidden="true">
          →
        </span>
      </button>

      <div className="section-head">
        <h2>{date === todayKey() ? "Today's meals" : "Meals"}</h2>
        <button className="link" onClick={onSeeAll}>
          See all
        </button>
      </div>

      {MEAL_TYPES.map((meal) => {
        const items = entries.filter((e) => e.meal === meal);
        const kcal = Math.round(sumNutrients(items).calories);
        const suggested = suggestedMealKcal(meal, goals.calories);
        return (
          <section key={meal} className="card meal">
            <div className="meal-head">
              <span className={`tile tile-${meal}`} aria-hidden="true">
                {MEAL_ICONS[meal]}
              </span>
              <div className="meal-title">
                <h3>{MEAL_LABELS[meal]}</h3>
                <span className="muted">
                  {items.length
                    ? `${kcal.toLocaleString("en-US")} / ${suggested.toLocaleString("en-US")} kcal suggested`
                    : `Suggested ${suggested.toLocaleString("en-US")} kcal`}
                </span>
              </div>
              <button className="plus-btn" onClick={() => setAdding(meal)} aria-label={`Add food to ${MEAL_LABELS[meal]}`}>
                +
              </button>
            </div>
            {items.map((e) => (
              <button key={e.id} className="entry" onClick={() => setEditing(e)}>
                {e.photo && <img src={e.photo} alt="" className="thumb" />}
                <span className="entry-main">
                  <span className="entry-name">{e.name}</span>
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
            💧
          </span>
          <div className="meal-title">
            <h3>Water</h3>
            <span className="muted">
              {water} / {WATER_GOAL} glasses · {(water * GLASS_ML).toLocaleString("en-US")}ml
            </span>
          </div>
          <button className="plus-btn" onClick={() => actions.setWater(date, water + 1)} aria-label="Add a glass of water">
            +
          </button>
        </div>
        <div className="water">
          {Array.from({ length: Math.max(WATER_GOAL, water) }, (_, i) => (
            <button
              key={i}
              className={`glass ${i < water ? "full" : ""}`}
              onClick={() => actions.setWater(date, i < water ? i : i + 1)}
              aria-label={i < water ? `Remove glass ${i + 1}` : `Fill to ${i + 1} glasses`}
            />
          ))}
        </div>
      </section>

      <details className="card more">
        <summary>More nutrients</summary>
        <NutrientBar label="Fiber" value={total.fiber} goal={goals.fiber} unit="g" color="var(--neutral-fill)" />
        <NutrientBar label="Sugar" value={total.sugar} goal={goals.sugar} unit="g" color="var(--neutral-fill)" limit />
        <NutrientBar label="Sodium" value={total.sodium} goal={goals.sodium} unit="mg" color="var(--neutral-fill)" limit />
      </details>

      {adding && <AddFood date={date} meal={adding} onClose={() => setAdding(null)} />}
      {editing && <EditEntry entry={editing} onClose={() => setEditing(null)} />}
      {editingBurned && <BurnedSheet date={date} value={burned} onClose={() => setEditingBurned(false)} />}
    </div>
  );
}

function Stat({ icon, label, value, onClick }: { icon: string; label: string; value: number; onClick?: () => void }) {
  const body = (
    <>
      <span className="kpi-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="kpi-text">
        <span className="kpi-label">{label}</span>
        <strong>{value.toLocaleString("en-US")}</strong>
      </span>
    </>
  );
  return onClick ? (
    <button className="kpi" onClick={onClick} aria-label={`${label}: ${value} kcal. Edit`}>
      {body}
    </button>
  ) : (
    <div className="kpi">{body}</div>
  );
}

function BurnedSheet({ date, value, onClose }: { date: string; value: number; onClose: () => void }) {
  const [kcal, setKcal] = useState(value ? String(value) : "");
  const add = (n: number) => setKcal(String((Number(kcal) || 0) + n));
  return (
    <Sheet title="Calories burned" onClose={onClose}>
      <p className="muted small">
        Exercise calories for {formatLongDate(date)}. They're added back to what you can eat today.
      </p>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        placeholder="e.g. 300"
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
        Save
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

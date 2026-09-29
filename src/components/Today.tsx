import { useState } from "react";
import { sumNutrients } from "../../shared/nutrition.ts";
import { addDays, formatDateLabel, todayKey } from "../lib/dates.ts";
import { actions, entriesForDate, useAppState } from "../lib/store.ts";
import { MEAL_LABELS, MEAL_TYPES, type LogEntry, type MealType } from "../lib/types.ts";
import AddFood from "./AddFood.tsx";
import EditEntry from "./EditEntry.tsx";
import { CalorieRing, NutrientBar } from "./Progress.tsx";

export default function Today({
  date,
  onDateChange,
  onScan,
}: {
  date: string;
  onDateChange: (d: string) => void;
  onScan: () => void;
}) {
  const state = useAppState();
  const { goals } = state;
  const entries = entriesForDate(state, date);
  const total = sumNutrients(entries);
  const water = state.water[date] ?? 0;
  const [adding, setAdding] = useState<MealType | null>(null);
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const isToday = date === todayKey();

  return (
    <div className="page">
      <header className="date-nav">
        <button className="icon-btn" onClick={() => onDateChange(addDays(date, -1))} aria-label="Previous day">
          ‹
        </button>
        <h1>{formatDateLabel(date)}</h1>
        <button
          className="icon-btn"
          onClick={() => onDateChange(addDays(date, 1))}
          disabled={isToday}
          aria-label="Next day"
        >
          ›
        </button>
      </header>

      <section className="card summary">
        <CalorieRing eaten={total.calories} goal={goals.calories} />
        <div className="summary-stats">
          <div>
            <span className="muted small">Goal</span>
            <strong>{goals.calories.toLocaleString()}</strong>
          </div>
          <div>
            <span className="muted small">Eaten</span>
            <strong>{Math.round(total.calories).toLocaleString()}</strong>
          </div>
        </div>
      </section>

      <section className="card">
        <NutrientBar label="Protein" value={total.protein} goal={goals.protein} unit="g" color="var(--protein)" />
        <NutrientBar label="Carbs" value={total.carbs} goal={goals.carbs} unit="g" color="var(--carbs)" />
        <NutrientBar label="Fat" value={total.fat} goal={goals.fat} unit="g" color="var(--fat)" />
        <details className="more">
          <summary>More nutrients</summary>
          <NutrientBar label="Fiber" value={total.fiber} goal={goals.fiber} unit="g" color="var(--neutral-fill)" />
          <NutrientBar label="Sugar" value={total.sugar} goal={goals.sugar} unit="g" color="var(--neutral-fill)" limit />
          <NutrientBar label="Sodium" value={total.sodium} goal={goals.sodium} unit="mg" color="var(--neutral-fill)" limit />
        </details>
      </section>

      <button className="scan-cta" onClick={onScan}>
        <span aria-hidden="true">📷</span> Scan a meal
      </button>

      {MEAL_TYPES.map((meal) => {
        const items = entries.filter((e) => e.meal === meal);
        const kcal = Math.round(sumNutrients(items).calories);
        return (
          <section key={meal} className="card meal">
            <div className="row between">
              <h2 className="title">{MEAL_LABELS[meal]}</h2>
              <span className="muted">{kcal > 0 ? `${kcal} kcal` : ""}</span>
            </div>
            {items.map((e) => (
              <button key={e.id} className="entry" onClick={() => setEditing(e)}>
                {e.photo ? <img src={e.photo} alt="" className="thumb" /> : <span className="thumb placeholder" />}
                <span className="entry-main">
                  <span className="entry-name">{e.name}</span>
                  <span className="muted small">
                    {e.portion} · P {Math.round(e.protein)} · C {Math.round(e.carbs)} · F {Math.round(e.fat)}
                  </span>
                </span>
                <span className="entry-kcal">{Math.round(e.calories)}</span>
              </button>
            ))}
            <button className="link" onClick={() => setAdding(meal)}>
              + Add food
            </button>
          </section>
        );
      })}

      <section className="card">
        <div className="row between">
          <h2 className="title">Water</h2>
          <span className="muted">{(water * 0.25).toFixed(2).replace(/\.?0+$/, "")} L</span>
        </div>
        <div className="water">
          {Array.from({ length: Math.max(8, water + 1) }, (_, i) => (
            <button
              key={i}
              className={`glass ${i < water ? "full" : ""}`}
              onClick={() => actions.setWater(date, i < water ? i : i + 1)}
              aria-label={`${i + 1} glass${i ? "es" : ""}`}
            />
          ))}
        </div>
      </section>

      {adding && <AddFood date={date} meal={adding} onClose={() => setAdding(null)} />}
      {editing && <EditEntry entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

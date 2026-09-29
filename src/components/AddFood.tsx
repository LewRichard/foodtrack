import { useState } from "react";
import type { FoodItem } from "../../shared/nutrition.ts";
import { searchFoods } from "../lib/foods.ts";
import { actions, newId, useAppState } from "../lib/store.ts";
import { MEAL_LABELS, type MealType } from "../lib/types.ts";
import { draftItem, ItemEditor, type Draft } from "./ItemEditor.tsx";
import Sheet from "./Sheet.tsx";

const BLANK: FoodItem = {
  name: "",
  portion: "1 serving",
  grams: 0,
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sodium: 0,
  confidence: "high",
};

export default function AddFood({ date, meal, onClose }: { date: string; meal: MealType; onClose: () => void }) {
  const { recents } = useAppState();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [source, setSource] = useState<"manual" | "quick">("quick");

  const q = query.trim().toLowerCase();
  const recentMatches = recents.filter((r) => !q || r.name.toLowerCase().includes(q)).slice(0, 8);
  const foodMatches = searchFoods(query);

  function pick(food: FoodItem, from: "manual" | "quick") {
    setSource(from);
    setDraft({ key: newId(), base: { ...food, confidence: "high" }, factor: 1 });
  }

  function add() {
    if (!draft) return;
    const item = draftItem(draft);
    actions.addEntries([
      { ...item, name: item.name.trim() || "Food", id: newId(), date, meal, loggedAt: Date.now(), source },
    ]);
    onClose();
  }

  return (
    <Sheet title={`Add to ${MEAL_LABELS[meal]}`} onClose={onClose}>
      {draft ? (
        <>
          <ItemEditor draft={draft} onChange={setDraft} defaultOpen={source === "manual"} />
          <div className="row gap">
            <button className="btn" onClick={() => setDraft(null)}>
              Back
            </button>
            <button className="btn primary grow" onClick={add}>
              Add {draftItem(draft).calories} kcal
            </button>
          </div>
        </>
      ) : (
        <>
          <input
            className="search"
            type="search"
            placeholder="Search foods"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button className="link" onClick={() => pick({ ...BLANK, name: query.trim() }, "manual")}>
            + Enter custom food{query.trim() ? ` “${query.trim()}”` : ""}
          </button>
          {recentMatches.length > 0 && (
            <>
              <p className="label">Recent</p>
              <FoodList foods={recentMatches} onPick={(f) => pick(f, "quick")} />
            </>
          )}
          <p className="label">Common foods</p>
          {foodMatches.length ? (
            <FoodList foods={foodMatches} onPick={(f) => pick(f, "quick")} />
          ) : (
            <p className="muted small">No matches. Try a custom food, or scan it with the camera.</p>
          )}
        </>
      )}
    </Sheet>
  );
}

function FoodList({ foods, onPick }: { foods: FoodItem[]; onPick: (f: FoodItem) => void }) {
  return (
    <div className="food-list">
      {foods.map((f, i) => (
        <button key={`${f.name}-${i}`} className="entry" onClick={() => onPick(f)}>
          <span className="entry-main">
            <span className="entry-name">{f.name}</span>
            <span className="muted small">{f.portion}</span>
          </span>
          <span className="entry-kcal">{Math.round(f.calories)}</span>
        </button>
      ))}
    </div>
  );
}

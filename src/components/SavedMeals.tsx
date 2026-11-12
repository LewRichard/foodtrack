import { useState } from "react";
import { sumNutrients, type FoodItem } from "../../shared/nutrition.ts";
import { useI18n } from "../i18n/index.ts";
import { actions, type SavedMeal } from "../lib/store.ts";
import type { MealType } from "../lib/types.ts";
import { Icon } from "./Icon.tsx";
import Sheet from "./Sheet.tsx";

/** Names a meal's items and saves them as a combo to log again in one tap. */
export function SaveMealSheet({ meal, items, onClose }: { meal: MealType; items: FoodItem[]; onClose: () => void }) {
  const { t, num } = useI18n();
  const [name, setName] = useState(() => {
    const names = items.map((i) => i.name).join(", ");
    return items.length === 1 ? items[0].name.slice(0, 60) : `${t(`meal.${meal}`)}: ${names}`.slice(0, 60);
  });
  const [saved, setSaved] = useState(false);
  const total = sumNutrients(items);

  return (
    <Sheet title={t("combo.saveTitle")} onClose={onClose}>
      {saved ? (
        <div className="stack center combo-saved">
          <span className="premium-mark" aria-hidden="true">
            <Icon name="check" size={24} />
          </span>
          <p>{t("combo.savedBody", { name: name.trim() })}</p>
          <button className="btn primary" onClick={onClose}>
            {t("common.done")}
          </button>
        </div>
      ) : (
        <div className="stack">
          <p className="muted small">{t("combo.saveBody")}</p>
          <label className="stack">
            <span className="label">{t("combo.name")}</span>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t("combo.namePlaceholder")} autoFocus />
          </label>
          <div className="food-list">
            {items.map((f, i) => (
              <div key={i} className="entry static">
                <span className="entry-main">
                  <span className="entry-name">{f.name}</span>
                  <span className="muted small">{f.portion}</span>
                </span>
                <span className="entry-kcal">{Math.round(f.calories)}</span>
              </div>
            ))}
          </div>
          <p className="muted small">
            {t("combo.total", { kcal: num(Math.round(total.calories)) })} · {t("abbr.protein")} {num(Math.round(total.protein))}g · {t("abbr.carbs")}{" "}
            {num(Math.round(total.carbs))}g · {t("abbr.fat")} {num(Math.round(total.fat))}g
          </p>
          <button
            className="btn primary"
            disabled={!name.trim()}
            onClick={() => {
              actions.saveMeal(name, items);
              setSaved(true);
            }}
          >
            <Icon name="bookmark" size={18} /> {t("combo.save")}
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** The person's combos in the Add food sheet: tap one to log all of it. */
export function SavedMealList({ meals, onLog }: { meals: SavedMeal[]; onLog: (m: SavedMeal) => void }) {
  const { t, tp, num } = useI18n();
  if (!meals.length) return null;
  return (
    <>
      <p className="label">{t("combo.yours")}</p>
      <div className="food-list">
        {meals.map((m) => (
          <div key={m.id} className="combo-row">
            <button className="entry" onClick={() => onLog(m)}>
              <span className="combo-icon" aria-hidden="true">
                <Icon name="layers" size={18} />
              </span>
              <span className="entry-main">
                <span className="entry-name">{m.name}</span>
                <span className="muted small">{tp("scan.items", m.items.length)}</span>
              </span>
              <span className="entry-kcal">{num(Math.round(sumNutrients(m.items).calories))}</span>
            </button>
            <button
              className="icon-btn combo-delete"
              aria-label={t("combo.delete", { name: m.name })}
              onClick={() => {
                if (confirm(t("combo.deleteConfirm", { name: m.name }))) actions.deleteSavedMeal(m.id);
              }}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

import { useState } from "react";
import { scaleItem, type FoodItem, type Nutrients } from "../../shared/nutrition.ts";
import { useI18n, type MessageKey } from "../i18n/index.ts";
import { Icon } from "./Icon.tsx";

/** An item being reviewed: the original estimate plus a serving multiplier. */
export interface Draft {
  key: string;
  base: FoodItem;
  factor: number;
}

export function draftItem(d: Draft): FoodItem {
  if (d.factor === 1) return { ...d.base };
  return { ...scaleItem(d.base, d.factor), portion: `${d.factor} × ${d.base.portion}` };
}

const FIELDS: { key: keyof Nutrients; label: MessageKey; unit: string }[] = [
  { key: "calories", label: "nutrient.calories", unit: "kcal" },
  { key: "protein", label: "nutrient.protein", unit: "g" },
  { key: "carbs", label: "nutrient.carbs", unit: "g" },
  { key: "fat", label: "nutrient.fat", unit: "g" },
  { key: "fiber", label: "nutrient.fiber", unit: "g" },
  { key: "sugar", label: "nutrient.sugar", unit: "g" },
  { key: "sodium", label: "nutrient.sodium", unit: "mg" },
];

const STEP = 0.25;

export function ItemEditor({
  draft,
  onChange,
  onRemove,
  defaultOpen = false,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onRemove?: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { t } = useI18n();
  const item = draftItem(draft);
  const setFactor = (f: number) => onChange({ ...draft, factor: Math.max(STEP, Math.round(f / STEP) * STEP) });
  const setField = (key: keyof Nutrients, value: number) =>
    onChange({ ...draft, base: { ...draft.base, [key]: (Number.isFinite(value) ? value : 0) / draft.factor } });

  return (
    <div className="item-editor">
      <div className="item-row">
        <div className="item-main">
          <input
            className="item-name"
            value={draft.base.name}
            onChange={(e) => onChange({ ...draft, base: { ...draft.base, name: e.target.value } })}
            aria-label={t("item.foodName")}
          />
          <div className="muted small">
            {draft.factor !== 1 && `${draft.factor} × `}
            {draft.base.portion} · ~{item.grams} g
            {draft.base.confidence === "low" && <span className="badge warn">{t("item.lowConfidence")}</span>}
          </div>
        </div>
        <div className="item-kcal">
          <strong>{item.calories}</strong>
          <span className="muted small">kcal</span>
        </div>
      </div>

      <div className="item-controls">
        <div className="stepper" aria-label={t("item.servings")}>
          <button onClick={() => setFactor(draft.factor - STEP)} aria-label={t("item.less")}>−</button>
          <span>{draft.factor}×</span>
          <button onClick={() => setFactor(draft.factor + STEP)} aria-label={t("item.more")}>+</button>
        </div>
        <span className="macro-chips small">
          <span className="chip protein">{t("abbr.protein")} {item.protein}g</span>
          <span className="chip carbs">{t("abbr.carbs")} {item.carbs}g</span>
          <span className="chip fat">{t("abbr.fat")} {item.fat}g</span>
        </span>
        <button className="link small" onClick={() => setOpen(!open)}>
          {open ? t("common.done") : t("common.edit")}
        </button>
        {onRemove && (
          <button className="icon-btn" onClick={onRemove} aria-label={t("item.remove", { name: draft.base.name })}>
            <Icon name="x" size={20} />
          </button>
        )}
      </div>

      {open && (
        <div className="field-grid">
          <label>
            <span>{t("item.portion")}</span>
            <input
              value={draft.base.portion}
              onChange={(e) => onChange({ ...draft, base: { ...draft.base, portion: e.target.value } })}
            />
          </label>
          {FIELDS.map((f) => (
            <label key={f.key}>
              <span>
                {t(f.label)} ({f.unit})
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={item[f.key]}
                onChange={(e) => setField(f.key, e.target.valueAsNumber)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

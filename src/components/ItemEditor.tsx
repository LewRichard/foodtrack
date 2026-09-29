import { useState } from "react";
import { scaleItem, type FoodItem, type Nutrients } from "../../shared/nutrition.ts";

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

const FIELDS: { key: keyof Nutrients; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" },
  { key: "sugar", label: "Sugar", unit: "g" },
  { key: "sodium", label: "Sodium", unit: "mg" },
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
            aria-label="Food name"
          />
          <div className="muted small">
            {draft.factor !== 1 && `${draft.factor} × `}
            {draft.base.portion} · ~{item.grams} g
            {draft.base.confidence === "low" && <span className="badge warn">low confidence</span>}
          </div>
        </div>
        <div className="item-kcal">
          <strong>{item.calories}</strong>
          <span className="muted small">kcal</span>
        </div>
      </div>

      <div className="item-controls">
        <div className="stepper" aria-label="Servings">
          <button onClick={() => setFactor(draft.factor - STEP)} aria-label="Less">−</button>
          <span>{draft.factor}×</span>
          <button onClick={() => setFactor(draft.factor + STEP)} aria-label="More">+</button>
        </div>
        <span className="macro-chips small">
          <span className="chip protein">P {item.protein}g</span>
          <span className="chip carbs">C {item.carbs}g</span>
          <span className="chip fat">F {item.fat}g</span>
        </span>
        <button className="link small" onClick={() => setOpen(!open)}>
          {open ? "Done" : "Edit"}
        </button>
        {onRemove && (
          <button className="icon-btn" onClick={onRemove} aria-label={`Remove ${draft.base.name}`}>
            ✕
          </button>
        )}
      </div>

      {open && (
        <div className="field-grid">
          <label>
            <span>Portion</span>
            <input
              value={draft.base.portion}
              onChange={(e) => onChange({ ...draft, base: { ...draft.base, portion: e.target.value } })}
            />
          </label>
          {FIELDS.map((f) => (
            <label key={f.key}>
              <span>
                {f.label} ({f.unit})
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

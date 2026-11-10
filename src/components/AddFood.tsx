import { useState } from "react";
import type { FoodItem } from "../../shared/nutrition.ts";
import type { BarcodeProduct } from "../lib/barcode.ts";
import DescribeMeal from "./DescribeMeal.tsx";
import { searchFoods } from "../lib/foods.ts";
import { actions, newId, useAppState } from "../lib/store.ts";
import { useI18n } from "../i18n/index.ts";
import { type MealType } from "../lib/types.ts";
import { draftItem, ItemEditor, type Draft } from "./ItemEditor.tsx";
import BarcodeScanner from "./BarcodeScanner.tsx";
import Sheet from "./Sheet.tsx";

const BLANK: FoodItem = {
  name: "",
  portion: "",
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

export default function AddFood({
  date,
  meal,
  onClose,
  onAdded = onClose,
  startWithBarcode = false,
}: {
  date: string;
  meal: MealType;
  onClose: () => void;
  onAdded?: () => void;
  startWithBarcode?: boolean;
}) {
  const { recents } = useAppState();
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [source, setSource] = useState<"manual" | "quick">("quick");
  const [scanning, setScanning] = useState(startWithBarcode);
  const [describing, setDescribing] = useState(false);
  const [product, setProduct] = useState<BarcodeProduct | null>(null);

  const q = query.trim().toLowerCase();
  const recentMatches = recents.filter((r) => !q || r.name.toLowerCase().includes(q)).slice(0, 8);
  const foodMatches = searchFoods(query, lang);

  function pick(food: FoodItem, from: "manual" | "quick") {
    setSource(from);
    setScanning(false);
    setDraft({ key: newId(), base: { ...food, confidence: "high" }, factor: 1 });
  }

  function scanned(found: BarcodeProduct) {
    pick(found.food, "quick");
    setProduct(found);
  }

  function back() {
    setDraft(null);
    if (product) setScanning(true);
    setProduct(null);
  }

  function add() {
    if (!draft) return;
    const item = draftItem(draft);
    actions.addEntries([
      { ...item, name: item.name.trim() || t("add.defaultName"), id: newId(), date, meal, loggedAt: Date.now(), source },
    ]);
    onAdded();
  }

  return (
    <Sheet title={t("add.title", { meal: t(`meal.${meal}`) })} onClose={onClose}>
      {draft ? (
        <>
          {product && (
            <p className={`small barcode-note ${product.incomplete ? "error" : "muted"}`}>
              {product.incomplete ? t("barcode.incomplete") : product.per === "100g" ? t("barcode.per100g") : t("barcode.perServing")}
            </p>
          )}
          <ItemEditor draft={draft} onChange={setDraft} defaultOpen={source === "manual" || Boolean(product?.incomplete)} />
          <div className="row gap">
            <button className="btn" onClick={back}>
              {t("common.back")}
            </button>
            <button className="btn primary grow" onClick={add}>
              {t("add.add", { kcal: draftItem(draft).calories })}
            </button>
          </div>
        </>
      ) : scanning ? (
        <>
          <BarcodeScanner
            onFound={scanned}
            onEnterManually={() => pick({ ...BLANK, portion: t("common.oneServing") }, "manual")}
          />
          <button className="link" onClick={() => setScanning(false)}>
            {t("barcode.searchInstead")}
          </button>
        </>
      ) : (
        <>
          <input
            className="search"
            type="search"
            placeholder={t("add.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="row gap add-ways">
            <button className="btn barcode-open" onClick={() => setScanning(true)}>
              {t("add.barcode")}
            </button>
            <button className="btn barcode-open" onClick={() => setDescribing(true)}>
              ✍️ {t("describe.short")}
            </button>
          </div>
          {describing && <DescribeMeal date={date} meal={meal} onClose={() => setDescribing(false)} onLogged={onAdded} />}
          <button className="link" onClick={() => pick({ ...BLANK, name: query.trim(), portion: t("common.oneServing") }, "manual")}>
            {query.trim() ? t("add.customNamed", { name: query.trim() }) : t("add.custom")}
          </button>
          {recentMatches.length > 0 && (
            <>
              <p className="label">{t("add.recent")}</p>
              <FoodList foods={recentMatches} onPick={(f) => pick(f, "quick")} />
            </>
          )}
          <p className="label">{t("add.common")}</p>
          {foodMatches.length ? (
            <FoodList foods={foodMatches} onPick={(f) => pick(f, "quick")} />
          ) : (
            <p className="muted small">{t("add.noMatches")}</p>
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

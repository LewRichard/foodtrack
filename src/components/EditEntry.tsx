import { lazy, Suspense, useState } from "react";
import { shareFoodFrom } from "../../shared/sharedFood.ts";
import { cloudEnabled } from "../lib/cloud.ts";
import { actions, foodOf } from "../lib/store.ts";
import { useI18n } from "../i18n/index.ts";
import { MEAL_TYPES, type LogEntry } from "../lib/types.ts";
import { draftItem, ItemEditor, type Draft } from "./ItemEditor.tsx";
import Sheet from "./Sheet.tsx";
import { Icon } from "./Icon.tsx";

const ShareFoodSheet = lazy(() => import("./ShareFood.tsx"));

export default function EditEntry({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>({ key: entry.id, base: entry, factor: 1 });
  const [meal, setMeal] = useState(entry.meal);
  const [sharing, setSharing] = useState(false);
  const { t } = useI18n();

  if (sharing) {
    return (
      <Suspense fallback={null}>
        <ShareFoodSheet food={shareFoodFrom(entry.name, [foodOf({ ...entry, ...draftItem(draft) })], entry.photo)} onClose={onClose} />
      </Suspense>
    );
  }

  function save() {
    actions.updateEntry(entry.id, { ...draftItem(draft), meal });
    onClose();
  }

  return (
    <Sheet title={t("edit.title")} onClose={onClose}>
      {entry.photo && <img src={entry.photo} alt="" className="sheet-photo" />}
      <ItemEditor draft={draft} onChange={setDraft} defaultOpen />
      <div className="segmented">
        {MEAL_TYPES.map((m) => (
          <button key={m} className={m === meal ? "active" : ""} onClick={() => setMeal(m)}>
            {t(`meal.${m}`)}
          </button>
        ))}
      </div>
      <div className="row gap">
        <button
          className="btn danger"
          onClick={() => {
            actions.removeEntry(entry.id);
            onClose();
          }}
        >
          {t("common.delete")}
        </button>
        {cloudEnabled && (
          <button className="btn" onClick={() => setSharing(true)} aria-label={t("share.title")}>
            <Icon name="send" size={18} />
          </button>
        )}
        <button className="btn primary grow" onClick={save}>
          {t("common.save")}
        </button>
      </div>
    </Sheet>
  );
}

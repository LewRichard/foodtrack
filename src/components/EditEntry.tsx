import { useState } from "react";
import { actions } from "../lib/store.ts";
import { MEAL_LABELS, MEAL_TYPES, type LogEntry } from "../lib/types.ts";
import { draftItem, ItemEditor, type Draft } from "./ItemEditor.tsx";
import Sheet from "./Sheet.tsx";

export default function EditEntry({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>({ key: entry.id, base: entry, factor: 1 });
  const [meal, setMeal] = useState(entry.meal);

  function save() {
    actions.updateEntry(entry.id, { ...draftItem(draft), meal });
    onClose();
  }

  return (
    <Sheet title="Edit food" onClose={onClose}>
      {entry.photo && <img src={entry.photo} alt="" className="sheet-photo" />}
      <ItemEditor draft={draft} onChange={setDraft} defaultOpen />
      <div className="segmented">
        {MEAL_TYPES.map((m) => (
          <button key={m} className={m === meal ? "active" : ""} onClick={() => setMeal(m)}>
            {MEAL_LABELS[m]}
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
          Delete
        </button>
        <button className="btn primary grow" onClick={save}>
          Save
        </button>
      </div>
    </Sheet>
  );
}

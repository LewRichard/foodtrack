import { useRef, useState } from "react";
import { getAccessCode, setAccessCode, unlock } from "../lib/api.ts";
import { actions, getState, useAppState, type AppState } from "../lib/store.ts";

export default function Profile({ onEditGoals }: { onEditGoals: () => void }) {
  const { name, profile, goals, entries, aiConsent } = useAppState();
  const [nameDraft, setNameDraft] = useState(name);
  const [code, setCode] = useState(getAccessCode());
  const [codeStatus, setCodeStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const daysLogged = new Set(entries.map((e) => e.date)).size;
  const initial = name.trim()[0]?.toUpperCase();

  async function saveCode() {
    if (!code.trim()) {
      setAccessCode("");
      setCodeStatus("Access code removed.");
      return;
    }
    setCodeStatus("Checking…");
    try {
      await unlock(code);
      setCodeStatus("Saved ✓");
    } catch (err) {
      setCodeStatus(err instanceof Error ? err.message : String(err));
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `foodtrack-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as AppState;
      if (!Array.isArray(data.entries)) throw new Error("Not a FoodTrack backup");
      if (confirm(`Replace your data with ${data.entries.length} entries from this backup?`)) {
        actions.importData(data);
        setNameDraft(getState().name);
      }
    } catch (err) {
      alert(`Could not import: ${err instanceof Error ? err.message : err}`);
    }
  }

  return (
    <div className="page">
      <section className="profile-hero">
        <span className="avatar large" aria-hidden="true">
          {initial ?? "🙂"}
        </span>
        <h1>{name.trim() || "Your profile"}</h1>
        <p className="muted">
          {daysLogged} day{daysLogged === 1 ? "" : "s"} logged · {goals.calories.toLocaleString("en-US")} kcal goal
        </p>
      </section>

      <section className="card">
        <h2 className="title">Your name</h2>
        <div className="row gap">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="What should we call you?"
            maxLength={40}
            autoComplete="given-name"
          />
          <button className="btn primary" disabled={nameDraft.trim() === name} onClick={() => actions.setName(nameDraft.trim())}>
            Save
          </button>
        </div>
      </section>

      <section className="card">
        <div className="row between">
          <h2 className="title">Body &amp; activity</h2>
          <button className="link" onClick={onEditGoals}>
            Edit
          </button>
        </div>
        {profile ? (
          <p className="muted">
            {profile.sex === "male" ? "Male" : "Female"} · {profile.age} yrs · {profile.heightCm} cm · {profile.weightKg} kg
          </p>
        ) : (
          <p className="muted">Add your details in Goals to get personalised calorie and macro targets.</p>
        )}
      </section>

      <section className="card">
        <h2 className="title">Photo scanning</h2>
        <label className="stack">
          <span className="muted small">Access code (only if the server owner gave you one)</span>
          <div className="row gap">
            <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="off" />
            <button className="btn" onClick={saveCode}>
              Save
            </button>
          </div>
        </label>
        {codeStatus && <p className="muted small">{codeStatus}</p>}
        <div className="row between">
          <span className="small">
            {aiConsent ? "You've agreed to send meal photos for AI analysis." : "You'll be asked before your first photo is analysed."}
          </span>
          {aiConsent && (
            <button className="btn" onClick={() => actions.setAiConsent(false)}>
              Withdraw
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="title">Your data</h2>
        <p className="muted small">Your diary is stored on this device only. Export a backup to move it to another device.</p>
        <div className="row gap wrap">
          <button className="btn" onClick={exportData}>
            Export backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm("Delete all logged food, goals and settings?")) {
                actions.reset();
                setNameDraft("");
              }
            }}
          >
            Reset all
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={importData} />
      </section>

      <p className="muted small center disclaimer">
        Photo estimates are approximate and not medical advice. Check with a healthcare professional before making major
        dietary changes. <a href="/privacy.html">Privacy policy</a>
      </p>
    </div>
  );
}

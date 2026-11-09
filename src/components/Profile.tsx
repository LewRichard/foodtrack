import { useRef, useState } from "react";
import { deviceLanguage, LANGUAGES, useI18n, type LanguagePref } from "../i18n/index.ts";
import { errorMessage, getAccessCode, setAccessCode, unlock } from "../lib/api.ts";
import { cloudEnabled, useSession } from "../lib/cloud.ts";
import { actions, getState, useAppState, type AppState } from "../lib/store.ts";
import { enableReminders } from "../lib/reminders.ts";
import { THEME_PREFS } from "../lib/theme.ts";
import Account from "./Account.tsx";
import Reminders from "./Reminders.tsx";

export default function Profile({ onEditGoals }: { onEditGoals: () => void }) {
  const { name, profile, goals, entries, aiConsent, language, theme } = useAppState();
  const { t, tp, num } = useI18n();
  const deviceLang = LANGUAGES.find((l) => l.code === deviceLanguage())!;
  const session = useSession();
  const [nameDraft, setNameDraft] = useState(name);
  const [lastName, setLastName] = useState(name);
  if (name !== lastName) {
    // Name changed elsewhere (e.g. downloaded from your account): show the new one.
    setLastName(name);
    setNameDraft(name);
  }
  const [code, setCode] = useState(getAccessCode());
  const [codeStatus, setCodeStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const daysLogged = new Set(entries.map((e) => e.date)).size;
  const initial = name.trim()[0]?.toUpperCase();

  async function saveCode() {
    if (!code.trim()) {
      setAccessCode("");
      setCodeStatus(t("profile.codeRemoved"));
      return;
    }
    setCodeStatus(t("common.checking"));
    try {
      await unlock(code);
      setCodeStatus(t("common.saved"));
    } catch (err) {
      setCodeStatus(errorMessage(err));
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
      if (!Array.isArray(data.entries)) throw new Error(t("profile.notBackup"));
      const where = session ? t("profile.whereAccount") : t("profile.whereDevice");
      if (confirm(t("profile.importConfirm", { n: data.entries.length, where }))) {
        actions.importData(data);
        setNameDraft(getState().name);
      }
    } catch (err) {
      alert(t("profile.importError", { error: err instanceof Error ? err.message : String(err) }));
    }
  }

  return (
    <div className="page">
      <section className="profile-hero">
        <span className="avatar large" aria-hidden="true">
          {initial ?? "🙂"}
        </span>
        <h1>{name.trim() || t("profile.yourProfile")}</h1>
        <p className="muted">{tp("profile.stats", daysLogged, { kcal: num(goals.calories) })}</p>
      </section>

      {cloudEnabled && <Account />}

      <Reminders />

      <section className="card">
        <label className="stack">
          <h2 className="title">{t("profile.language")}</h2>
          <select
            value={language}
            onChange={(e) => {
              actions.setLanguage(e.target.value as LanguagePref);
              // Reminders already on: resend them so notifications come in the new language.
              const { reminders } = getState();
              if (reminders.enabled) void enableReminders(reminders.times).catch(() => {});
            }}
          >
            <option value="auto">{t("profile.languageAuto", { name: deviceLang.name })}</option>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card">
        <h2 className="title" id="theme-title">{t("profile.theme")}</h2>
        <div className="segmented" role="radiogroup" aria-labelledby="theme-title">
          {THEME_PREFS.map((option) => (
            <button
              key={option}
              role="radio"
              aria-checked={theme === option}
              className={theme === option ? "active" : ""}
              onClick={() => actions.setTheme(option)}
            >
              {t(`theme.${option}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="title">{t("profile.name")}</h2>
        <div className="row gap">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder={t("profile.namePlaceholder")}
            maxLength={40}
            autoComplete="given-name"
          />
          <button className="btn primary" disabled={nameDraft.trim() === name} onClick={() => actions.setName(nameDraft.trim())}>
            {t("common.save")}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="row between">
          <h2 className="title">{t("profile.body")}</h2>
          <button className="link" onClick={onEditGoals}>
            {t("common.edit")}
          </button>
        </div>
        {profile ? (
          <p className="muted">
            {t("profile.bodySummary", {
              sex: profile.sex === "male" ? t("goals.male") : t("goals.female"),
              age: profile.age,
              height: profile.heightCm,
              weight: profile.weightKg,
            })}
          </p>
        ) : (
          <p className="muted">{t("profile.bodyEmpty")}</p>
        )}
      </section>

      <section className="card">
        <h2 className="title">{t("profile.scanning")}</h2>
        <label className="stack">
          <span className="muted small">{session ? t("profile.accessCodeSignedIn") : t("profile.accessCode")}</span>
          <div className="row gap">
            <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="off" />
            <button className="btn" onClick={saveCode}>
              {t("common.save")}
            </button>
          </div>
        </label>
        {codeStatus && <p className="muted small">{codeStatus}</p>}
        <div className="row between">
          <span className="small">
            {aiConsent ? t("profile.consentYes") : t("profile.consentNo")}
          </span>
          {aiConsent && (
            <button className="btn" onClick={() => actions.setAiConsent(false)}>
              {t("profile.withdraw")}
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="title">{t("profile.data")}</h2>
        <p className="muted small">{session ? t("profile.dataAccount") : t("profile.dataDevice")}</p>
        <div className="row gap wrap">
          <button className="btn" onClick={exportData}>
            {t("profile.export")}
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            {t("profile.import")}
          </button>
          {!session && (
            <button
              className="btn danger"
              onClick={() => {
                if (confirm(t("profile.resetConfirm"))) {
                  actions.reset();
                  setNameDraft("");
                }
              }}
            >
              {t("profile.reset")}
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={importData} />
      </section>

      <p className="muted small center disclaimer">
        {t("profile.disclaimer")} <a href="/privacy.html">{t("profile.privacy")}</a>
      </p>
    </div>
  );
}

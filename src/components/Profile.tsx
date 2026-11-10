import { useMemo, useRef, useState, type ReactNode } from "react";
import { deviceLanguage, LANGUAGES, useI18n, type LanguagePref } from "../i18n/index.ts";
import { errorMessage, getAccessCode, setAccessCode, unlock } from "../lib/api.ts";
import { cloudEnabled, useSession } from "../lib/cloud.ts";
import { actions, getState, useAppState, type AppState } from "../lib/store.ts";
import { setAvatar, syncNotificationLanguage, useMyProfile } from "../lib/community.ts";
import { enableReminders } from "../lib/reminders.ts";
import { THEME_PREFS } from "../lib/theme.ts";
import Account from "./Account.tsx";
import { AchievementsPanel } from "./Achievements.tsx";
import Sheet from "./Sheet.tsx";
import { badges, streak } from "../lib/achievements.ts";
import { APPLE_HEALTH_ENABLED } from "../lib/health.ts";
import AvatarCropper from "./AvatarCropper.tsx";
import ProfilePhoto from "./ProfilePhoto.tsx";
import HealthSync from "./HealthSync.tsx";
import Reminders from "./Reminders.tsx";

export default function Profile({ onEditGoals }: { onEditGoals: () => void }) {
  const state = useAppState();
  const { name, profile, goals, entries, aiConsent, language, theme, reminders, health } = state;
  const [open, setOpen] = useState<
    null | "achievements" | "account" | "reminders" | "health" | "name" | "language" | "theme" | "scanning" | "data"
  >(null);
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
  // The photo belongs to the Community profile, so it can be changed once someone has joined.
  const { profile: community } = useMyProfile(cloudEnabled ? (session?.user.id ?? null) : null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const [cropping, setCropping] = useState<File | null>(null);

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setCropping(file);
  }

  async function savePhoto(file: Blob) {
    setCropping(null);
    setPhotoBusy(true);
    setPhotoError("");
    try {
      await setAvatar(file);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhotoBusy(false);
    }
  }

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

  function setLanguage(next: LanguagePref) {
    actions.setLanguage(next);
    // Reminders already on: resend them so notifications come in the new language.
    const { reminders } = getState();
    if (reminders.enabled) void enableReminders(reminders.times).catch(() => {});
    if (session) void syncNotificationLanguage().catch(() => {});
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

  const s = streak(state);
  const allBadges = useMemo(() => badges(state), [state]);
  const earnedBadges = allBadges.filter((b) => b.earned);
  const langName = language === "auto" ? t("profile.languageAuto", { name: deviceLang.name }) : (LANGUAGES.find((l) => l.code === language)?.name ?? "");
  const close = () => setOpen(null);

  return (
    <div className="page">
      <section className="profile-hero">
        <span className="avatar large" aria-hidden="true">
          <ProfilePhoto fallback={initial ?? "🙂"} />
        </span>
        {community && (
          <>
            <button className="link small" disabled={photoBusy} onClick={() => photoInput.current?.click()}>
              {photoBusy ? t("common.pleaseWait") : community.avatar_path ? t("community.changeAvatar") : t("community.addAvatar")}
            </button>
            <input ref={photoInput} type="file" accept="image/*" hidden onChange={pickPhoto} />
            {photoError && <p className="error small">{photoError}</p>}
            {cropping && <AvatarCropper file={cropping} onCancel={() => setCropping(null)} onDone={savePhoto} />}
          </>
        )}
        <h1>{name.trim() || t("profile.yourProfile")}</h1>
        <p className="muted">{tp("profile.stats", daysLogged, { kcal: num(goals.calories) })}</p>
      </section>

      <Group title={t("profile.groupProgress")}>
        <Row
          icon="🏆"
          title={t("streak.achievements")}
          sub={`${t("profile.badgesSummary", { n: earnedBadges.length, total: allBadges.length })} · 🔥 ${s.current}`}
          value={
            <span className="settings-badges" aria-hidden="true">
              {earnedBadges.slice(-3).map((b) => (
                <span key={b.id}>{b.icon}</span>
              ))}
            </span>
          }
          onClick={() => setOpen("achievements")}
        />
        <Row
          icon="🎯"
          title={t("profile.goalsBody")}
          sub={
            profile
              ? t("profile.bodySummary", {
                  sex: profile.sex === "male" ? t("goals.male") : t("goals.female"),
                  age: profile.age,
                  height: profile.heightCm,
                  weight: profile.weightKg,
                })
              : t("profile.bodyMissing")
          }
          value={`${num(goals.calories)} kcal`}
          onClick={onEditGoals}
        />
      </Group>

      <Group title={t("profile.groupAccount")}>
        {cloudEnabled && <Row icon="☁️" title={t("account.title")} sub={session?.user.email ?? undefined} onClick={() => setOpen("account")} />}
        <Row icon="👤" title={t("profile.name")} value={name.trim() || "—"} onClick={() => setOpen("name")} />
      </Group>

      <Group title={t("profile.groupSettings")}>
        <Row icon="🔔" title={t("rem.title")} value={reminders.enabled ? t("profile.on") : t("profile.off")} onClick={() => setOpen("reminders")} />
        {APPLE_HEALTH_ENABLED && (
          <Row icon="❤️" title={t("appleHealth.title")} value={health.connected ? t("profile.on") : t("profile.off")} onClick={() => setOpen("health")} />
        )}
        <Row icon="🌐" title={t("profile.language")} value={langName} onClick={() => setOpen("language")} />
        <Row icon="🌓" title={t("profile.theme")} value={t(`theme.${theme}`)} onClick={() => setOpen("theme")} />
      </Group>

      <Group title={t("profile.groupPrivacy")}>
        <Row icon="📸" title={t("profile.scanning")} value={aiConsent ? t("profile.consentShortYes") : t("profile.consentShortNo")} onClick={() => setOpen("scanning")} />
        <Row icon="💾" title={t("profile.data")} sub={t("profile.dataSummary")} onClick={() => setOpen("data")} />
        <a className="settings-row" href="/privacy.html" target="_blank" rel="noreferrer">
          <span className="settings-icon" aria-hidden="true">
            🔒
          </span>
          <span className="settings-text">{t("profile.privacy")}</span>
          <span className="settings-chev" aria-hidden="true">
            ›
          </span>
        </a>
      </Group>

      <p className="muted small center disclaimer">{t("profile.disclaimer")}</p>

      {open === "achievements" && (
        <Sheet title={`🏆 ${t("streak.achievements")}`} onClose={close}>
          <AchievementsPanel />
        </Sheet>
      )}

      {open === "account" && (
        <Sheet title={t("account.title")} onClose={close}>
          <div className="settings-sheet">
            <Account />
          </div>
        </Sheet>
      )}

      {open === "reminders" && (
        <Sheet title={t("rem.title")} onClose={close}>
          <div className="settings-sheet">
            <Reminders />
          </div>
        </Sheet>
      )}

      {open === "health" && (
        <Sheet title={t("appleHealth.title")} onClose={close}>
          <div className="settings-sheet">
            <HealthSync />
          </div>
        </Sheet>
      )}

      {open === "name" && (
        <Sheet title={t("profile.name")} onClose={close}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              actions.setName(nameDraft.trim());
              close();
            }}
          >
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder={t("profile.namePlaceholder")}
              maxLength={40}
              autoComplete="given-name"
              autoFocus
            />
            <button className="btn primary" disabled={nameDraft.trim() === name}>
              {t("common.save")}
            </button>
          </form>
        </Sheet>
      )}

      {open === "language" && (
        <Sheet title={t("profile.language")} onClose={close}>
          <div className="choice-list" role="radiogroup">
            {[{ code: "auto" as LanguagePref, name: t("profile.languageAuto", { name: deviceLang.name }) }, ...LANGUAGES].map((l) => (
              <button
                key={l.code}
                role="radio"
                aria-checked={language === l.code}
                className={`choice ${language === l.code ? "active" : ""}`}
                onClick={() => {
                  setLanguage(l.code);
                  close();
                }}
              >
                <span>{l.name}</span>
                {language === l.code && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {open === "theme" && (
        <Sheet title={t("profile.theme")} onClose={close}>
          <div className="choice-list" role="radiogroup">
            {THEME_PREFS.map((option) => (
              <button
                key={option}
                role="radio"
                aria-checked={theme === option}
                className={`choice ${theme === option ? "active" : ""}`}
                onClick={() => actions.setTheme(option)}
              >
                <span>{t(`theme.${option}`)}</span>
                {theme === option && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {open === "scanning" && (
        <Sheet title={t("profile.scanning")} onClose={close}>
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
          <div className="row between gap">
            <span className="small">{aiConsent ? t("profile.consentYes") : t("profile.consentNo")}</span>
            {aiConsent && (
              <button className="btn" onClick={() => actions.setAiConsent(false)}>
                {t("profile.withdraw")}
              </button>
            )}
          </div>
        </Sheet>
      )}

      {open === "data" && (
        <Sheet title={t("profile.data")} onClose={close}>
          <p className="muted small">{session ? t("profile.dataAccount") : t("profile.dataDevice")}</p>
          <div className="stack">
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
                    close();
                  }
                }}
              >
                {t("profile.reset")}
              </button>
            )}
          </div>
        </Sheet>
      )}
      <input ref={fileRef} type="file" accept="application/json" hidden onChange={importData} />
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h2 className="settings-heading">{title}</h2>
      <div className="card settings-list">{children}</div>
    </section>
  );
}

function Row({ icon, title, sub, value, onClick }: { icon: string; title: string; sub?: string; value?: ReactNode; onClick: () => void }) {
  return (
    <button className="settings-row" onClick={onClick}>
      <span className="settings-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="settings-text">
        <span>{title}</span>
        {sub && <span className="muted small">{sub}</span>}
      </span>
      {value !== undefined && <span className="muted settings-value">{value}</span>}
      <span className="settings-chev" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

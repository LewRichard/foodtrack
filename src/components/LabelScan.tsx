import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { labelServing, type LabelResult } from "../../shared/label.ts";
import { useI18n } from "../i18n/index.ts";
import { analyzeLabel, errorMessage, isPremiumError, isSignInError } from "../lib/api.ts";
import { formatLongDate, todayKey } from "../lib/dates.ts";
import { prepareFromFile, type PreparedImage } from "../lib/image.ts";
import { isNative, pickNativePhoto } from "../lib/native.ts";
import { freeLeft, noteAiLog, openPaywall, usePlan } from "../lib/plan.ts";
import { actions, getState, newId } from "../lib/store.ts";
import { MEAL_TYPES, mealForTime, type MealType } from "../lib/types.ts";
import Consent from "./Consent.tsx";
import { Icon } from "./Icon.tsx";
import { draftItem, ItemEditor, type Draft } from "./ItemEditor.tsx";
import { FreeLogsLeft } from "./Scan.tsx";

/** Photograph a Nutrition Facts label: the AI reads one serving's values, you pick how much you had. */
export default function LabelScan({
  date,
  meal: initialMeal,
  onClose,
  onLogged,
  onSignIn,
}: {
  date: string;
  meal?: MealType;
  onClose: () => void;
  onLogged: () => void;
  onSignIn?: () => void;
}) {
  const i18n = useI18n();
  const { t, num } = i18n;
  const plan = usePlan();
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const [phase, setPhase] = useState<"input" | "analyzing" | "review">("input");
  const [label, setLabel] = useState<LabelResult | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState("");
  const [meal, setMeal] = useState<MealType>(initialMeal ?? mealForTime());
  const [error, setError] = useState<{ text: string; signIn: boolean } | null>(null);
  const [consent, setConsent] = useState<PreparedImage | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const prepared = await prepareFromFile(file);
      setPhoto(prepared);
      void analyze(prepared);
    } catch (e) {
      setError({ text: t("scan.photosError", { error: e instanceof Error ? e.message : String(e) }), signIn: false });
    }
  }

  async function pick(source: "camera" | "library") {
    setError(null);
    if (!isNative) {
      (source === "camera" ? cameraInput : galleryInput).current?.click();
      return;
    }
    try {
      const p = await pickNativePhoto(source);
      if (p) {
        setPhoto(p);
        void analyze(p);
      }
    } catch (e) {
      setError({ text: errorMessage(e), signIn: false });
    }
  }

  async function analyze(image: PreparedImage) {
    if (freeLeft(plan) === 0) {
      openPaywall("limit");
      return;
    }
    if (!getState().aiConsent) {
      setConsent(image);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("analyzing");
    setError(null);
    try {
      const result = await analyzeLabel(image, i18n.lang, controller.signal);
      noteAiLog();
      setLabel(result);
      if (result.isLabel) {
        const base = labelServing(result, t("label.defaultName"));
        setName(base.name);
        setDraft({ key: newId(), base, factor: 1 });
      }
      setPhase("review");
    } catch (e) {
      if (controller.signal.aborted) return;
      if (isPremiumError(e)) openPaywall("limit");
      setError({ text: errorMessage(e), signIn: isSignInError(e) });
      setPhase("input");
    }
  }

  function log() {
    if (!draft) return;
    const item = draftItem(draft);
    actions.addEntries([{ ...item, name: name.trim() || item.name, id: newId(), date, meal, loggedAt: Date.now(), source: "quick" }]);
    onLogged();
  }

  const item = draft ? draftItem(draft) : null;
  const perPack = label?.servingsPerContainer ?? 0;

  return createPortal(
    <div className="describe" role="dialog" aria-modal="true" aria-label={t("label.title")}>
      <div className="page describe-page">
        <header className="coach-head">
          <button className="icon-btn" onClick={phase === "review" ? () => setPhase("input") : onClose} aria-label={t("common.back")}>
            <Icon name="chevron-left" size={22} />
          </button>
          <span className="coach-avatar" aria-hidden="true">
            <Icon name="label" />
          </span>
          <div className="coach-title">
            <strong>{t("label.title")}</strong>
            <span className="muted small">{t("label.subtitle")}</span>
          </div>
        </header>

        {phase !== "review" && (
          <section className="card stack">
            {photo ? (
              <img className="label-photo" src={photo.dataUrl} alt={t("label.photoAlt")} />
            ) : (
              <div className="label-example" aria-hidden="true">
                <strong>Nutrition Facts</strong>
                <span>Serving size 1 cup (240 ml)</span>
                <b>Calories 150</b>
                <span>Total Fat 4g · Protein 8g</span>
              </div>
            )}
            <p className="muted small">{t("label.tip")}</p>
            {phase === "analyzing" ? (
              <>
                <p className="plan-writing small">
                  <span className="typing-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>{" "}
                  {t("label.reading")}
                </p>
                <button
                  className="btn"
                  onClick={() => {
                    abortRef.current?.abort();
                    setPhase("input");
                  }}
                >
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <div className="row gap">
                <button className="btn primary grow" onClick={() => void pick("camera")}>
                  <Icon name="camera" size={18} /> {t("scan.takePhoto")}
                </button>
                <button className="btn grow" onClick={() => void pick("library")}>
                  <Icon name="image" size={18} /> {t("scan.gallery")}
                </button>
              </div>
            )}
            <FreeLogsLeft />
            {error && (
              <div className="stack">
                <p className="error small" role="alert">
                  {error.text}
                </p>
                {error.signIn && onSignIn && (
                  <button className="btn small-btn" onClick={onSignIn}>
                    {t("scan.signInAction")}
                  </button>
                )}
              </div>
            )}
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.target.files).then(() => (e.target.value = ""))} />
            <input ref={galleryInput} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files).then(() => (e.target.value = ""))} />
          </section>
        )}

        {phase === "review" && label && !label.isLabel && (
          <section className="card stack">
            <p>{t("label.notLabel")}</p>
            <button className="btn primary" onClick={() => setPhase("input")}>
              {t("menu.retake")}
            </button>
          </section>
        )}

        {phase === "review" && label?.isLabel && draft && item && (
          <>
            <section className="card stack">
              <label className="stack">
                <span className="label">{t("label.productName")}</span>
                <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="label-facts">
                <span>
                  <span className="muted small">{t("label.servingSize")}</span>
                  <strong>{label.servingSize || "—"}</strong>
                </span>
                <span>
                  <span className="muted small">{t("label.perServing")}</span>
                  <strong>{num(label.calories)} kcal</strong>
                </span>
                {perPack > 0 && (
                  <span>
                    <span className="muted small">{t("label.perPack")}</span>
                    <strong>{num(perPack, 1)}</strong>
                  </span>
                )}
              </div>
              {label.notes && <p className="muted small note">{label.notes}</p>}
            </section>

            <section className="card stack">
              <p className="label">{t("label.howMuch")}</p>
              <div className="segmented">
                <button className={draft.factor === 1 ? "active" : ""} onClick={() => setDraft({ ...draft, factor: 1 })}>
                  {t("label.oneServing")}
                </button>
                {perPack > 1 && (
                  <button className={draft.factor === perPack ? "active" : ""} onClick={() => setDraft({ ...draft, factor: perPack })}>
                    {t("label.wholePack", { n: num(perPack, 1) })}
                  </button>
                )}
              </div>
              <div className="list">
                <ItemEditor draft={draft} onChange={setDraft} />
              </div>
            </section>

            <div className="card">
              <p className="label">{t("scan.addTo")}</p>
              <div className="segmented">
                {MEAL_TYPES.map((m) => (
                  <button key={m} className={m === meal ? "active" : ""} onClick={() => setMeal(m)}>
                    {t(`meal.${m}`)}
                  </button>
                ))}
              </div>
              {date !== todayKey() && <p className="muted small">{t("scan.loggingTo", { date: formatLongDate(date, i18n) })}</p>}
            </div>

            <div className="sticky-actions">
              <button className="btn" onClick={() => setPhase("input")}>
                {t("label.retake")}
              </button>
              <button className="btn primary grow" onClick={log}>
                {t("scan.log", { kcal: num(Math.round(item.calories)) })}
              </button>
            </div>
          </>
        )}
      </div>
      {consent && (
        <Consent
          onClose={() => setConsent(null)}
          onAccept={() => {
            actions.setAiConsent(true);
            const image = consent;
            setConsent(null);
            void analyze(image);
          }}
        />
      )}
    </div>,
    document.body,
  );
}

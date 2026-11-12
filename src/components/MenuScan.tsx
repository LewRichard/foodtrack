import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_MENU_PHOTOS, remainingFor, topPicks, type MenuDish, type MenuFit, type MenuResult } from "../../shared/menu.ts";
import { sumNutrients } from "../../shared/nutrition.ts";
import { useI18n, type MessageKey } from "../i18n/index.ts";
import { analyzeMenu, errorMessage, isPremiumError, isSignInError } from "../lib/api.ts";
import { formatLongDate, todayKey } from "../lib/dates.ts";
import { prepareFromFile, type PreparedImage } from "../lib/image.ts";
import { isNative, pickNativePhoto } from "../lib/native.ts";
import { freeLeft, noteAiLog, openPaywall, usePlan } from "../lib/plan.ts";
import { actions, entriesForDate, getState, newId, useAppState } from "../lib/store.ts";
import { MEAL_TYPES, mealForTime, type LogEntry, type MealType } from "../lib/types.ts";
import Consent from "./Consent.tsx";
import { Icon } from "./Icon.tsx";
import { draftItem, ItemEditor, type Draft } from "./ItemEditor.tsx";
import { FreeLogsLeft } from "./Scan.tsx";

const PREFS_KEY = "foodtrack:menuPrefs";
const FIT_LABEL: Record<MenuFit, MessageKey> = { best: "menu.fit.best", good: "menu.fit.good", ok: "menu.fit.ok", avoid: "menu.fit.avoid" };

function loadPrefs(): string {
  try {
    return localStorage.getItem(PREFS_KEY) ?? "";
  } catch {
    return "";
  }
}

function savePrefs(value: string) {
  try {
    if (value.trim()) localStorage.setItem(PREFS_KEY, value.trim());
    else localStorage.removeItem(PREFS_KEY);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

/**
 * Photograph a restaurant menu: the AI estimates every dish and suggests the ones that fit what's
 * left to eat today. Pick what you ordered and log it.
 */
export default function MenuScan({ date, onClose, onLogged, onSignIn }: { date: string; onClose: () => void; onLogged: () => void; onSignIn?: () => void }) {
  const i18n = useI18n();
  const { t, num } = i18n;
  const state = useAppState();
  const plan = usePlan();
  const [photos, setPhotos] = useState<PreparedImage[]>([]);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [phase, setPhase] = useState<"input" | "analyzing" | "menu" | "log">("input");
  const [menu, setMenu] = useState<MenuResult | null>(null);
  const [chosen, setChosen] = useState<MenuDish[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [meal, setMeal] = useState<MealType>(mealForTime());
  const [onlyFits, setOnlyFits] = useState(false);
  const [error, setError] = useState<{ text: string; signIn: boolean } | null>(null);
  const [consent, setConsent] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const remaining = remainingFor(state.goals, sumNutrients(entriesForDate(state, date)));
  const full = photos.length >= MAX_MENU_PHOTOS;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    try {
      const room = MAX_MENU_PHOTOS - photos.length;
      const prepared = await Promise.all([...files].slice(0, room).map((f) => prepareFromFile(f)));
      setPhotos((p) => [...p, ...prepared].slice(0, MAX_MENU_PHOTOS));
    } catch (e) {
      setError({ text: t("scan.photosError", { error: e instanceof Error ? e.message : String(e) }), signIn: false });
    }
  }

  async function pick(source: "camera" | "library") {
    if (!isNative) {
      (source === "camera" ? cameraInput : galleryInput).current?.click();
      return;
    }
    try {
      const photo = await pickNativePhoto(source);
      if (photo) setPhotos((p) => [...p, photo].slice(0, MAX_MENU_PHOTOS));
    } catch (e) {
      setError({ text: errorMessage(e), signIn: false });
    }
  }

  async function analyze() {
    if (!photos.length) return;
    if (freeLeft(plan) === 0) {
      openPaywall("limit");
      return;
    }
    if (!getState().aiConsent) {
      setConsent(true);
      return;
    }
    savePrefs(prefs);
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("analyzing");
    setError(null);
    try {
      const result = await analyzeMenu(photos, { remaining, goal: state.profile?.goal ?? null, preferences: prefs.trim().slice(0, 200) }, i18n.lang, controller.signal);
      noteAiLog();
      setMenu(result);
      setChosen([]);
      setPhase("menu");
    } catch (e) {
      if (controller.signal.aborted) return;
      if (isPremiumError(e)) openPaywall("limit");
      setError({ text: errorMessage(e), signIn: isSignInError(e) });
      setPhase("input");
    }
  }

  function toggle(dish: MenuDish) {
    setChosen((c) => (c.includes(dish) ? c.filter((d) => d !== dish) : [...c, dish]));
  }

  function review() {
    setDrafts(chosen.map((d, i) => ({ key: `${i}-${d.menuName}`, base: dishItem(d), factor: 1 })));
    setPhase("log");
  }

  function log() {
    const now = Date.now();
    const scores = chosen.map((d) => d.healthScore);
    const entries: LogEntry[] = drafts.map((d, i) => ({
      ...draftItem(d),
      id: newId(),
      date,
      meal,
      loggedAt: now + i,
      source: "quick",
      healthScore: scores[i],
    }));
    actions.addEntries(entries);
    onLogged();
  }

  const back = () => {
    if (phase === "log") setPhase("menu");
    else if (phase === "menu") setPhase("input");
    else onClose();
  };

  const chosenKcal = chosen.reduce((n, d) => n + d.calories, 0);
  const logTotal = sumNutrients(drafts.map(draftItem));

  return createPortal(
    <div className="describe" role="dialog" aria-modal="true" aria-label={t("menu.title")}>
      <div className="page describe-page">
        <header className="coach-head">
          <button className="icon-btn" onClick={back} aria-label={t("common.back")}>
            <Icon name="chevron-left" size={22} />
          </button>
          <span className="coach-avatar" aria-hidden="true">
            <Icon name="menu" />
          </span>
          <div className="coach-title">
            <strong>{t("menu.title")}</strong>
            <span className="muted small">{t("menu.subtitle")}</span>
          </div>
        </header>

        <section className="card menu-left" aria-label={t("menu.leftToday")}>
          <span className="muted small">{date === todayKey() ? t("menu.leftToday") : t("menu.leftOn", { date: formatLongDate(date, i18n) })}</span>
          <strong>{num(remaining.calories)} kcal</strong>
          <span className="muted small">
            {t("abbr.protein")} {num(remaining.protein)}g · {t("abbr.carbs")} {num(remaining.carbs)}g · {t("abbr.fat")} {num(remaining.fat)}g
          </span>
        </section>

        {(phase === "input" || phase === "analyzing") && (
          <section className="card stack">
            <p className="label">{t("menu.photosLabel", { n: MAX_MENU_PHOTOS })}</p>
            {photos.length > 0 && (
              <div className="menu-photos">
                {photos.map((p, i) => (
                  <figure key={i} className="menu-photo">
                    <img src={p.dataUrl} alt={t("menu.page", { n: i + 1 })} />
                    {phase === "input" && (
                      <button className="menu-photo-remove" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label={t("menu.removePage", { n: i + 1 })}>
                        <Icon name="x" size={14} />
                      </button>
                    )}
                  </figure>
                ))}
              </div>
            )}
            {!full && phase === "input" && (
              <div className="row gap">
                <button className={`btn grow ${photos.length ? "" : "primary"}`} onClick={() => void pick("camera")}>
                  <Icon name="camera" size={18} /> {photos.length ? t("menu.addPage") : t("scan.takePhoto")}
                </button>
                <button className="btn grow" onClick={() => void pick("library")}>
                  <Icon name="image" size={18} /> {t("scan.gallery")}
                </button>
              </div>
            )}
            <label className="stack">
              <span className="label">{t("menu.prefsLabel")}</span>
              <input value={prefs} maxLength={200} disabled={phase === "analyzing"} onChange={(e) => setPrefs(e.target.value)} placeholder={t("menu.prefsPlaceholder")} />
            </label>
            <FreeLogsLeft />
            {phase === "analyzing" ? (
              <>
                <p className="plan-writing small">
                  <span className="typing-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>{" "}
                  {t("menu.reading")}
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
              <button className="btn primary" disabled={!photos.length} onClick={() => void analyze()}>
                <Icon name="sparkles" size={18} /> {t("menu.analyze")}
              </button>
            )}
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
            <p className="muted small">{t("menu.tip")}</p>
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ""))} />
            <input ref={galleryInput} type="file" accept="image/*" multiple hidden onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ""))} />
          </section>
        )}

        {phase === "menu" && menu && !menu.isMenu && (
          <section className="card stack">
            <p>{t("menu.notMenu")}</p>
            <button className="btn primary" onClick={() => setPhase("input")}>
              {t("menu.retake")}
            </button>
          </section>
        )}

        {phase === "menu" && menu?.isMenu && (
          <>
            {(menu.restaurant || menu.advice) && (
              <section className="card">
                {menu.restaurant && <h2 className="title">{menu.restaurant}</h2>}
                {menu.advice && <p className="muted small note">{menu.advice}</p>}
              </section>
            )}

            <h2 className="menu-section">{t("menu.bestForYou")}</h2>
            <div className="stack">
              {topPicks(menu, remaining.calories).map((d) => (
                <DishCard key={`top-${d.menuName}`} dish={d} picked={chosen.includes(d)} onToggle={() => toggle(d)} caloriesLeft={remaining.calories} highlight />
              ))}
            </div>

            <div className="row between menu-all-head">
              <h2 className="menu-section">{t("menu.wholeMenu", { n: menu.dishes.length })}</h2>
              <label className="menu-filter small">
                <input type="checkbox" checked={onlyFits} onChange={(e) => setOnlyFits(e.target.checked)} /> {t("menu.onlyFits")}
              </label>
            </div>
            <div className="stack">
              {menu.dishes
                .filter((d) => !onlyFits || d.calories <= remaining.calories)
                .map((d) => (
                  <DishCard key={d.menuName} dish={d} picked={chosen.includes(d)} onToggle={() => toggle(d)} caloriesLeft={remaining.calories} />
                ))}
            </div>
            <p className="muted small center menu-disclaimer">{t("menu.estimate")}</p>

            <div className="sticky-actions">
              <button className="btn primary grow" disabled={!chosen.length} onClick={review}>
                {chosen.length ? t("menu.logChosen", { kcal: num(chosenKcal) }) : t("menu.pickHint")}
              </button>
            </div>
          </>
        )}

        {phase === "log" && (
          <>
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
              <p className="muted small">{t("menu.adjustHint")}</p>
            </div>
            <div className="card list">
              {drafts.map((d, i) => (
                <ItemEditor
                  key={d.key}
                  draft={d}
                  onChange={(next) => setDrafts(drafts.map((x, j) => (j === i ? next : x)))}
                  onRemove={() => {
                    setDrafts(drafts.filter((_, j) => j !== i));
                    setChosen(chosen.filter((_, j) => j !== i));
                  }}
                />
              ))}
            </div>
            <div className="sticky-actions">
              <button className="btn" onClick={() => setPhase("menu")}>
                {t("menu.backToMenu")}
              </button>
              <button className="btn primary grow" disabled={!drafts.length} onClick={log}>
                {t("scan.log", { kcal: num(logTotal.calories) })}
              </button>
            </div>
          </>
        )}
      </div>
      {consent && (
        <Consent
          onClose={() => setConsent(false)}
          onAccept={() => {
            actions.setAiConsent(true);
            setConsent(false);
            void analyze();
          }}
        />
      )}
    </div>,
    document.body,
  );
}

function dishItem(d: MenuDish) {
  const { name, portion, grams, calories, protein, carbs, fat, fiber, sugar, sodium, confidence } = d;
  return { name, portion, grams, calories, protein, carbs, fat, fiber, sugar, sodium, confidence };
}

function DishCard({
  dish,
  picked,
  onToggle,
  caloriesLeft,
  highlight = false,
}: {
  dish: MenuDish;
  picked: boolean;
  onToggle: () => void;
  caloriesLeft: number;
  highlight?: boolean;
}) {
  const { t, num } = useI18n();
  const over = dish.calories > caloriesLeft;
  return (
    <article className={`card menu-dish ${highlight ? "top" : ""} ${picked ? "picked" : ""}`}>
      <div className="row between menu-dish-head">
        <div className="menu-dish-name">
          <strong>{dish.translated || dish.menuName}</strong>
          {dish.translated && <span className="muted small">{dish.menuName}</span>}
        </div>
        <div className="menu-dish-kcal">
          <strong className={over ? "over" : ""}>{num(dish.calories)}</strong>
          <span className="muted tiny">kcal</span>
        </div>
      </div>
      <div className="menu-dish-meta small">
        <span className={`menu-fit fit-${dish.fit}`}>{t(FIT_LABEL[dish.fit])}</span>
        <span className="muted">
          {t("abbr.protein")} {num(Math.round(dish.protein))}g · {t("abbr.carbs")} {num(Math.round(dish.carbs))}g · {t("abbr.fat")} {num(Math.round(dish.fat))}g
        </span>
        {dish.price && <span className="muted">· {dish.price}</span>}
      </div>
      {dish.reason && <p className="small menu-dish-reason">{dish.reason}</p>}
      {dish.tip && (
        <p className="small muted menu-dish-tip">
          <Icon name="lightbulb" size={14} /> {dish.tip}
        </p>
      )}
      <button className={`btn small-btn ${picked ? "primary" : ""}`} onClick={onToggle} aria-pressed={picked}>
        {picked ? (
          <>
            <Icon name="check" size={16} /> {t("menu.picked")}
          </>
        ) : (
          <>
            <Icon name="plus" size={16} /> {t("menu.pick")}
          </>
        )}
      </button>
    </article>
  );
}

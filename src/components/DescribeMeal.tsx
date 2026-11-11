import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sumNutrients } from "../../shared/nutrition.ts";
import { useI18n } from "../i18n/index.ts";
import { analyzeText, errorMessage, isPremiumError, isSignInError, type TextAnalysis } from "../lib/api.ts";
import { freeLeft, noteAiLog, openPaywall, usePlan } from "../lib/plan.ts";
import { FreeLogsLeft } from "./Scan.tsx";
import { formatLongDate, todayKey } from "../lib/dates.ts";
import { actions, newId } from "../lib/store.ts";
import { MEAL_TYPES, mealForTime, type LogEntry, type MealType } from "../lib/types.ts";
import { HealthScoreCard } from "./HealthScore.tsx";
import { draftItem, ItemEditor, type Draft } from "./ItemEditor.tsx";
import { Icon } from "./Icon.tsx";

// The browser's own speech-to-text (Chrome, Edge, Safari). Not in every browser or in the iPhone app,
// where the microphone on the keyboard does the same job.
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;
const SpeechRecognition: RecognitionCtor | undefined =
  typeof window === "undefined"
    ? undefined
    : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition);

const MAX_LENGTH = 500;

/** Log food by typing or saying what you ate; the AI splits it into items with nutrition. */
export default function DescribeMeal({
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
  const { t, tp, num, locale } = i18n;
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"input" | "analyzing" | "review">("input");
  const [result, setResult] = useState<TextAnalysis | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [meal, setMeal] = useState<MealType>(initialMeal ?? mealForTime());
  const [error, setError] = useState<{ text: string; signIn: boolean } | null>(null);
  const [listening, setListening] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const plan = usePlan();
  const recognitionRef = useRef<Recognition | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      recognitionRef.current?.stop();
    },
    [],
  );

  function toggleVoice() {
    if (!SpeechRecognition) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = locale;
    rec.interimResults = true;
    rec.continuous = true;
    const before = text.trim();
    rec.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      setText(`${before}${before ? " " : ""}${heard.trim()}`.slice(0, MAX_LENGTH));
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError({ text: t("describe.micBlocked"), signIn: false });
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setError(null);
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  async function analyze() {
    recognitionRef.current?.stop();
    const description = text.trim();
    if (!description) return;
    if (freeLeft(plan) === 0) {
      openPaywall("limit");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("analyzing");
    setError(null);
    try {
      const r = await analyzeText(description, i18n.lang, controller.signal);
      noteAiLog();
      setResult(r);
      setDrafts(r.items.map((base, i) => ({ key: `${i}-${base.name}`, base, factor: 1 })));
      if (r.meal) setMeal(r.meal); // "trưa nay…" wins over the meal the sheet was opened from
      setPhase("review");
    } catch (e) {
      if (controller.signal.aborted) return;
      if (isPremiumError(e)) openPaywall("limit");
      setError({ text: errorMessage(e), signIn: isSignInError(e) });
      setPhase("input");
    }
  }

  function log() {
    const now = Date.now();
    const entries: LogEntry[] = drafts.map((d, i) => ({
      ...draftItem(d),
      id: newId(),
      date,
      meal,
      loggedAt: now + i,
      source: "quick",
      healthScore: result?.healthScore || undefined,
    }));
    actions.addEntries(entries);
    onLogged();
  }

  const total = sumNutrients(drafts.map(draftItem));

  return createPortal(
    <div className="describe" role="dialog" aria-modal="true" aria-label={t("describe.title")}>
      <div className="page describe-page">
        <header className="coach-head">
          <button className="icon-btn" onClick={phase === "review" ? () => setPhase("input") : onClose} aria-label={t("common.back")}>
            <Icon name="chevron-left" size={22} />
          </button>
          <span className="coach-avatar" aria-hidden="true">
            <Icon name="pen" />
          </span>
          <div className="coach-title">
            <strong>{t("describe.title")}</strong>
            <span className="muted small">{t("describe.subtitle")}</span>
          </div>
        </header>

        {phase !== "review" ? (
          <section className="card stack">
            <label className="stack">
              <span className="label">{t("describe.label")}</span>
              <textarea
                rows={4}
                value={text}
                maxLength={MAX_LENGTH}
                disabled={phase === "analyzing"}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("describe.placeholder")}
                autoFocus
              />
            </label>
            {SpeechRecognition ? (
              <button className={`btn describe-mic ${listening ? "listening" : ""}`} disabled={phase === "analyzing"} onClick={toggleVoice} aria-pressed={listening}>
                <Icon name={listening ? "stop" : "mic"} size={18} /> {listening ? t("describe.stopListening") : t("describe.speak")}
              </button>
            ) : (
              <p className="muted small describe-hint"><Icon name="mic" size={16} /> {t("describe.keyboardMic")}</p>
            )}
            <FreeLogsLeft />
            {phase === "analyzing" ? (
              <>
                <p className="plan-writing small">
                  <span className="typing-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>{" "}
                  {t("describe.analyzing")}
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
              <button className="btn primary" disabled={!text.trim()} onClick={() => void analyze()}>
                <Icon name="sparkles" size={18} /> {t("describe.analyze")}
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
          </section>
        ) : result && !result.isFood ? (
          <section className="card stack">
            <p>{t("describe.noFood")}</p>
            <button className="btn primary" onClick={() => setPhase("input")}>
              {t("describe.edit")}
            </button>
          </section>
        ) : (
          result && (
            <>
              <div className="card">
                <div className="row between">
                  <div>
                    <h2 className="title">{result.mealName}</h2>
                    <p className="muted small">
                      {tp("scan.items", drafts.length)} · {t("abbr.protein")} {Math.round(total.protein)}g · {t("abbr.carbs")} {Math.round(total.carbs)}g ·{" "}
                      {t("abbr.fat")} {Math.round(total.fat)}g
                    </p>
                  </div>
                  <div className="big-kcal">
                    <strong>{num(total.calories)}</strong>
                    <span className="muted small">kcal</span>
                  </div>
                </div>
                <p className="muted small note">“{text.trim()}”</p>
                {result.notes && <p className="muted small note">{result.notes}</p>}
              </div>

              {result.healthScore > 0 && <HealthScoreCard score={result.healthScore} reason={result.healthReason} />}

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

              <div className="card list">
                {drafts.map((d, i) => (
                  <ItemEditor
                    key={d.key}
                    draft={d}
                    onChange={(next) => setDrafts(drafts.map((x, j) => (j === i ? next : x)))}
                    onRemove={() => setDrafts(drafts.filter((_, j) => j !== i))}
                  />
                ))}
              </div>

              <div className="sticky-actions">
                <button className="btn" onClick={() => setPhase("input")}>
                  {t("describe.edit")}
                </button>
                <button className="btn primary grow" disabled={drafts.length === 0} onClick={log}>
                  {t("scan.log", { kcal: num(total.calories) })}
                </button>
              </div>
            </>
          )
        )}
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useRef, useState } from "react";
import { sumNutrients, type AnalysisResult } from "../../shared/nutrition.ts";
import { useI18n } from "../i18n/index.ts";
import { analyzeImage, errorMessage, isAccessError, isSignInError, unlock } from "../lib/api.ts";
import { formatLongDate, todayKey } from "../lib/dates.ts";
import { prepareFromFile, prepareFromSource, type PreparedImage } from "../lib/image.ts";
import { isNative, pickNativePhoto } from "../lib/native.ts";
import { actions, getState, newId } from "../lib/store.ts";
import { MEAL_TYPES, mealForTime, type LogEntry, type MealType } from "../lib/types.ts";
import Consent from "./Consent.tsx";
import { draftItem, ItemEditor, type Draft } from "./ItemEditor.tsx";

type Phase =
  | { kind: "capture" }
  | { kind: "analyzing"; image: PreparedImage }
  | { kind: "review"; image: PreparedImage; result: AnalysisResult }
  | { kind: "error"; image: PreparedImage; message: string; needs: "code" | "signin" | null };

export default function Scan({
  date,
  onLogged,
  onCancel,
  onSignIn,
}: {
  date: string;
  onLogged: () => void;
  onCancel: () => void;
  onSignIn: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "capture" });
  const [note, setNote] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [meal, setMeal] = useState<MealType>(mealForTime());
  const [awaitingConsent, setAwaitingConsent] = useState<PreparedImage | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const i18n = useI18n();
  const { t, tp, num } = i18n;

  useEffect(() => () => abortRef.current?.abort(), []);

  async function analyze(image: PreparedImage) {
    if (!getState().aiConsent) {
      setAwaitingConsent(image);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "analyzing", image });
    try {
      const result = await analyzeImage(image, note, i18n.lang, controller.signal);
      setDrafts(result.items.map((base, i) => ({ key: `${i}-${base.name}`, base, factor: 1 })));
      setPhase({ kind: "review", image, result });
    } catch (e) {
      if (controller.signal.aborted) return;
      setPhase({
        kind: "error",
        image,
        message: errorMessage(e),
        needs: isSignInError(e) ? "signin" : isAccessError(e) ? "code" : null,
      });
    }
  }

  function logMeal(image: PreparedImage) {
    const now = Date.now();
    const entries: LogEntry[] = drafts.map((d, i) => ({
      ...draftItem(d),
      id: newId(),
      date,
      meal,
      loggedAt: now + i,
      source: "scan",
      // Keep the thumbnail on the first item only so storage stays small.
      photo: i === 0 ? image.thumbnail : undefined,
    }));
    actions.addEntries(entries);
    onLogged();
  }

  if (phase.kind === "capture") {
    return (
      <>
        <Capture note={note} onNoteChange={setNote} onImage={analyze} onCancel={onCancel} />
        {awaitingConsent && (
          <Consent
            onClose={() => setAwaitingConsent(null)}
            onAccept={() => {
              actions.setAiConsent(true);
              const image = awaitingConsent;
              setAwaitingConsent(null);
              analyze(image);
            }}
          />
        )}
      </>
    );
  }

  const { image } = phase;
  const total = sumNutrients(drafts.map(draftItem));

  return (
    <div className="page scan-result">
      <div className="photo-wrap">
        <img src={image.dataUrl} alt={t("scan.yourMeal")} className="photo" />
        {phase.kind === "analyzing" && (
          <div className="photo-overlay">
            <div className="spinner" />
            <p>{t("scan.analyzing")}</p>
          </div>
        )}
      </div>

      {phase.kind === "error" && phase.needs === "code" && (
        <AccessCodeCard onUnlocked={() => analyze(image)} onCancel={() => setPhase({ kind: "capture" })} />
      )}

      {phase.kind === "error" && phase.needs === "signin" && (
        <div className="card">
          <h2 className="title">{t("scan.signInTitle")}</h2>
          <p className="muted small">{t("scan.signInBody")}</p>
          <div className="row gap">
            <button className="btn" onClick={() => setPhase({ kind: "capture" })}>
              {t("common.cancel")}
            </button>
            <button className="btn primary grow" onClick={onSignIn}>
              {t("scan.signInAction")}
            </button>
          </div>
        </div>
      )}

      {phase.kind === "error" && !phase.needs && (
        <div className="card">
          <p className="error">{phase.message}</p>
          <div className="row gap">
            <button className="btn primary" onClick={() => analyze(image)}>
              {t("scan.tryAgain")}
            </button>
            <button className="btn" onClick={() => setPhase({ kind: "capture" })}>
              {t("scan.newPhoto")}
            </button>
          </div>
        </div>
      )}

      {phase.kind === "review" && !phase.result.isFood && (
        <div className="card">
          <p>{t("scan.noFood")}</p>
          <button className="btn primary" onClick={() => setPhase({ kind: "capture" })}>
            {t("scan.retakePhoto")}
          </button>
        </div>
      )}

      {phase.kind === "review" && phase.result.isFood && (
        <>
          <div className="card">
            <div className="row between">
              <div>
                <h2 className="title">{phase.result.mealName}</h2>
                <p className="muted small">
                  {tp("scan.items", drafts.length)} · {t("abbr.protein")} {Math.round(total.protein)}g · {t("abbr.carbs")}{" "}
                  {Math.round(total.carbs)}g · {t("abbr.fat")} {Math.round(total.fat)}g
                </p>
              </div>
              <div className="big-kcal">
                <strong>{num(total.calories)}</strong>
                <span className="muted small">kcal</span>
              </div>
            </div>
            {phase.result.notes && <p className="muted small note">{phase.result.notes}</p>}
          </div>

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
            <button
              className="link"
              onClick={() =>
                setDrafts([
                  ...drafts,
                  {
                    key: newId(),
                    factor: 1,
                    base: {
                      name: t("scan.extraItem"),
                      portion: t("common.oneServing"),
                      grams: 0,
                      calories: 0,
                      protein: 0,
                      carbs: 0,
                      fat: 0,
                      fiber: 0,
                      sugar: 0,
                      sodium: 0,
                      confidence: "high",
                    },
                  },
                ])
              }
            >
              {t("scan.addMissing")}
            </button>
          </div>

          <div className="sticky-actions">
            <button className="btn" onClick={() => setPhase({ kind: "capture" })}>
              {t("scan.retake")}
            </button>
            <button className="btn primary grow" disabled={drafts.length === 0} onClick={() => logMeal(image)}>
              {t("scan.log", { kcal: num(total.calories) })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Capture({
  note,
  onNoteChange,
  onImage,
  onCancel,
}: {
  note: string;
  onNoteChange: (s: string) => void;
  onImage: (img: PreparedImage) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  // In the iPhone app the native camera screen is used instead of a live preview.
  const [camera, setCamera] = useState<"starting" | "live" | "unavailable">(isNative ? "unavailable" : "starting");
  const [pickError, setPickError] = useState("");
  const { t } = useI18n();

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (isNative || !navigator.mediaDevices?.getUserMedia) {
      setCamera("unavailable");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        setCamera("live");
      })
      .catch(() => !cancelled && setCamera("unavailable"));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    onImage(prepareFromSource(v, v.videoWidth, v.videoHeight));
  }

  async function pick(source: "camera" | "library") {
    if (!isNative) {
      (source === "camera" ? cameraInput : galleryInput).current?.click();
      return;
    }
    setPickError("");
    try {
      const image = await pickNativePhoto(source);
      if (image) onImage(image);
    } catch (e) {
      setPickError(source === "camera" ? t("scan.cameraError") : t("scan.photosError", { error: e instanceof Error ? e.message : String(e) }));
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onImage(await prepareFromFile(file));
  }

  return (
    <div className="page capture">
      <div className="viewfinder">
        {camera !== "unavailable" ? (
          <video ref={videoRef} playsInline muted autoPlay />
        ) : (
          <div className="viewfinder-empty">
            {isNative ? (
              <>
                <p>{t("scan.nativeTitle")}</p>
                <p className="muted small">{t("scan.nativeHelp")}</p>
              </>
            ) : (
              <>
                <p>{t("scan.noLiveTitle")}</p>
                <p className="muted small">{t("scan.noLiveHelp")}</p>
              </>
            )}
          </div>
        )}
        {camera === "live" && <div className="frame" aria-hidden="true" />}
        <button className="close-btn" onClick={onCancel} aria-label={t("scan.closeCamera")}>
          ✕
        </button>
      </div>

      <input
        className="note-input"
        placeholder={t("scan.notePlaceholder")}
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        maxLength={200}
      />

      <div className="capture-actions">
        <button className="btn" onClick={() => pick("library")}>
          {t("scan.gallery")}
        </button>
        {camera === "live" ? (
          <button className="shutter" onClick={snap} aria-label={t("scan.takePhoto")} />
        ) : (
          <button className="btn primary" onClick={() => pick("camera")}>
            {t("scan.takePhoto")}
          </button>
        )}
        <span className="spacer" />
      </div>
      {pickError && <p className="error small center">{pickError}</p>}
      <p className="muted small center">{t("scan.tip")}</p>

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      <input ref={galleryInput} type="file" accept="image/*" hidden onChange={onFile} />
    </div>
  );
}

function AccessCodeCard({ onUnlocked, onCancel }: { onUnlocked: () => void; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { t } = useI18n();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await unlock(code);
      onUnlocked();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2 className="title">{t("scan.codeTitle")}</h2>
      <p className="muted small">{t("scan.codeHelp")}</p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t("scan.codePlaceholder")}
        autoComplete="off"
        autoCapitalize="off"
        autoFocus
      />
      {error && <p className="error small">{error}</p>}
      <div className="row gap">
        <button type="button" className="btn" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button className="btn primary grow" disabled={!code.trim() || busy}>
          {busy ? t("common.checking") : t("scan.unlock")}
        </button>
      </div>
    </form>
  );
}

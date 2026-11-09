import { useEffect, useRef, useState } from "react";
import { sumNutrients, type AnalysisResult } from "../../shared/nutrition.ts";
import { analyzeImage, isAccessError, isSignInError, unlock } from "../lib/api.ts";
import { todayKey } from "../lib/dates.ts";
import { prepareFromFile, prepareFromSource, type PreparedImage } from "../lib/image.ts";
import { isNative, pickNativePhoto } from "../lib/native.ts";
import { actions, getState, newId } from "../lib/store.ts";
import { MEAL_LABELS, MEAL_TYPES, mealForTime, type LogEntry, type MealType } from "../lib/types.ts";
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
      const result = await analyzeImage(image, note, controller.signal);
      setDrafts(result.items.map((base, i) => ({ key: `${i}-${base.name}`, base, factor: 1 })));
      setPhase({ kind: "review", image, result });
    } catch (e) {
      if (controller.signal.aborted) return;
      setPhase({
        kind: "error",
        image,
        message: e instanceof Error ? e.message : String(e),
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
        <img src={image.dataUrl} alt="Your meal" className="photo" />
        {phase.kind === "analyzing" && (
          <div className="photo-overlay">
            <div className="spinner" />
            <p>Analyzing your food…</p>
          </div>
        )}
      </div>

      {phase.kind === "error" && phase.needs === "code" && (
        <AccessCodeCard onUnlocked={() => analyze(image)} onCancel={() => setPhase({ kind: "capture" })} />
      )}

      {phase.kind === "error" && phase.needs === "signin" && (
        <div className="card">
          <h2 className="title">Sign in to scan</h2>
          <p className="muted small">
            Photo scanning is for signed-in users. It's free to create an account, and it also backs up your diary. You can
            still log food by hand without one.
          </p>
          <div className="row gap">
            <button className="btn" onClick={() => setPhase({ kind: "capture" })}>
              Cancel
            </button>
            <button className="btn primary grow" onClick={onSignIn}>
              Sign in or create account
            </button>
          </div>
        </div>
      )}

      {phase.kind === "error" && !phase.needs && (
        <div className="card">
          <p className="error">{phase.message}</p>
          <div className="row gap">
            <button className="btn primary" onClick={() => analyze(image)}>
              Try again
            </button>
            <button className="btn" onClick={() => setPhase({ kind: "capture" })}>
              New photo
            </button>
          </div>
        </div>
      )}

      {phase.kind === "review" && !phase.result.isFood && (
        <div className="card">
          <p>No food was recognized in this photo. Try again with the food centered and well lit.</p>
          <button className="btn primary" onClick={() => setPhase({ kind: "capture" })}>
            Retake photo
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
                  {drafts.length} item{drafts.length === 1 ? "" : "s"} · P {Math.round(total.protein)}g · C{" "}
                  {Math.round(total.carbs)}g · F {Math.round(total.fat)}g
                </p>
              </div>
              <div className="big-kcal">
                <strong>{Math.round(total.calories)}</strong>
                <span className="muted small">kcal</span>
              </div>
            </div>
            {phase.result.notes && <p className="muted small note">{phase.result.notes}</p>}
          </div>

          <div className="card">
            <p className="label">Add to</p>
            <div className="segmented">
              {MEAL_TYPES.map((m) => (
                <button key={m} className={m === meal ? "active" : ""} onClick={() => setMeal(m)}>
                  {MEAL_LABELS[m]}
                </button>
              ))}
            </div>
            {date !== todayKey() && <p className="muted small">Logging to {date}</p>}
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
                      name: "Extra item",
                      portion: "1 serving",
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
              + Add missing item
            </button>
          </div>

          <div className="sticky-actions">
            <button className="btn" onClick={() => setPhase({ kind: "capture" })}>
              Retake
            </button>
            <button className="btn primary grow" disabled={drafts.length === 0} onClick={() => logMeal(image)}>
              Log {Math.round(total.calories)} kcal
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
      setPickError(
        source === "camera"
          ? "Couldn't open the camera. Check that FoodTrack has camera access in Settings."
          : `Couldn't open your photos: ${e instanceof Error ? e.message : e}`,
      );
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
                <p>Snap your meal</p>
                <p className="muted small">Tap Take photo to open the camera, or choose one from your library.</p>
              </>
            ) : (
              <>
                <p>Live camera isn't available here.</p>
                <p className="muted small">Use the buttons below to take or choose a photo.</p>
              </>
            )}
          </div>
        )}
        {camera === "live" && <div className="frame" aria-hidden="true" />}
        <button className="close-btn" onClick={onCancel} aria-label="Close camera">
          ✕
        </button>
      </div>

      <input
        className="note-input"
        placeholder='Optional note, e.g. "large portion", "cooked in butter"'
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        maxLength={200}
      />

      <div className="capture-actions">
        <button className="btn" onClick={() => pick("library")}>
          Gallery
        </button>
        {camera === "live" ? (
          <button className="shutter" onClick={snap} aria-label="Take photo" />
        ) : (
          <button className="btn primary" onClick={() => pick("camera")}>
            Take photo
          </button>
        )}
        <span className="spacer" />
      </div>
      {pickError && <p className="error small center">{pickError}</p>}
      <p className="muted small center">Fit the whole plate in the frame. Good light gives better estimates.</p>

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      <input ref={galleryInput} type="file" accept="image/*" hidden onChange={onFile} />
    </div>
  );
}

function AccessCodeCard({ onUnlocked, onCancel }: { onUnlocked: () => void; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await unlock(code);
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2 className="title">Enter access code</h2>
      <p className="muted small">This FoodTrack server is private. Ask the person who runs it for the access code.</p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Access code"
        autoComplete="off"
        autoCapitalize="off"
        autoFocus
      />
      {error && <p className="error small">{error}</p>}
      <div className="row gap">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary grow" disabled={!code.trim() || busy}>
          {busy ? "Checking…" : "Unlock and scan"}
        </button>
      </div>
    </form>
  );
}

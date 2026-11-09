import { useEffect, useRef, useState, type FormEvent } from "react";
import { normalizeBarcode } from "../../shared/barcode.ts";
import { useI18n } from "../i18n/index.ts";
import { ApiError, errorMessage } from "../lib/api.ts";
import { cameraAvailable, createDetector, lookupBarcode, type BarcodeProduct, type Detector } from "../lib/barcode.ts";

type Status =
  | { kind: "scanning" }
  | { kind: "looking"; code: string }
  | { kind: "notFound"; code: string }
  | { kind: "error"; message: string };

/** Finds a packaged food by barcode: live camera, a photo of the barcode, or the typed number. */
export default function BarcodeScanner({
  onFound,
  onEnterManually,
}: {
  onFound: (product: BarcodeProduct) => void;
  onEnterManually: () => void;
}) {
  const { t, lang } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const detectorRef = useRef<Promise<Detector> | null>(null);
  const paused = useRef(false); // stop reading frames while a code is being looked up or shown
  const abortRef = useRef<AbortController | null>(null);
  const [camera, setCamera] = useState<"starting" | "live" | "off">(cameraAvailable() ? "starting" : "off");
  const [status, setStatus] = useState<Status>({ kind: "scanning" });
  const [typed, setTyped] = useState("");

  const detector = () => (detectorRef.current ??= createDetector());

  async function find(raw: string) {
    const code = normalizeBarcode(raw);
    if (!code) {
      setStatus({ kind: "error", message: t("barcode.invalid") });
      return;
    }
    paused.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: "looking", code });
    navigator.vibrate?.(40);
    try {
      onFound(await lookupBarcode(code, lang, controller.signal));
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof ApiError && e.code === "barcode_not_found") setStatus({ kind: "notFound", code });
      else setStatus({ kind: "error", message: errorMessage(e) });
    }
  }

  function scanAgain() {
    setStatus({ kind: "scanning" });
    paused.current = false;
  }

  // Live camera: read a frame a few times a second until a barcode shows up.
  useEffect(() => {
    if (!cameraAvailable()) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const tick = async () => {
      const video = videoRef.current;
      if (!stopped && !paused.current && video && video.readyState >= 2) {
        try {
          const [hit] = await (await detector()).detect(video);
          if (hit && !stopped && !paused.current && normalizeBarcode(hit.rawValue)) void find(hit.rawValue);
        } catch {
          // a frame that can't be read; try the next one
        }
      }
      if (!stopped) timer = setTimeout(tick, 250);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        setCamera("live");
        void tick();
      })
      .catch(() => !stopped && setCamera("off"));

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    paused.current = true;
    setStatus({ kind: "looking", code: "" });
    try {
      const bitmap = await createImageBitmap(file);
      const [hit] = await (await detector()).detect(bitmap);
      bitmap.close();
      if (hit) await find(hit.rawValue);
      else setStatus({ kind: "error", message: t("barcode.notInPhoto") });
    } catch {
      setStatus({ kind: "error", message: t("barcode.notInPhoto") });
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void find(typed);
  }

  return (
    <div className="barcode">
      {camera !== "off" && (
        <div className="barcode-view">
          <video ref={videoRef} playsInline muted autoPlay />
          <div className="barcode-frame" aria-hidden="true" />
          {camera === "starting" && <div className="spinner" />}
        </div>
      )}

      {status.kind === "scanning" && (
        <p className="muted small center">{camera === "off" ? t("barcode.noCamera") : t("barcode.hint")}</p>
      )}
      {status.kind === "looking" && (
        <p className="muted small center" role="status">
          {status.code ? t("barcode.looking", { code: status.code }) : t("barcode.reading")}
        </p>
      )}
      {(status.kind === "notFound" || status.kind === "error") && (
        <div className="card barcode-problem" role="alert">
          <p className={status.kind === "error" ? "error" : ""}>
            {status.kind === "notFound" ? t("barcode.notFound", { code: status.code }) : status.message}
          </p>
          <div className="row gap">
            <button className="btn" onClick={scanAgain}>
              {t("barcode.scanAgain")}
            </button>
            {status.kind === "notFound" && (
              <button className="btn primary grow" onClick={onEnterManually}>
                {t("barcode.enterManually")}
              </button>
            )}
          </div>
        </div>
      )}

      <button className="btn" onClick={() => photoInput.current?.click()}>
        {t("barcode.photo")}
      </button>
      <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />

      <form className="row gap" onSubmit={submit}>
        <input
          className="grow"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t("barcode.typePlaceholder")}
          aria-label={t("barcode.typePlaceholder")}
          value={typed}
          onChange={(e) => setTyped(e.target.value.replace(/[^\d\s-]/g, ""))}
        />
        <button className="btn" type="submit" disabled={!typed.trim()}>
          {t("barcode.find")}
        </button>
      </form>
      <p className="muted small center">{t("barcode.source")}</p>
    </div>
  );
}

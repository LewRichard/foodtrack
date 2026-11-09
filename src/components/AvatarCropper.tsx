import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/index.ts";
import Sheet from "./Sheet.tsx";

const OUTPUT = 320; // saved photo size (px)
const MAX_ZOOM = 4;

interface Pos {
  x: number; // image's top-left corner inside the frame (px, ≤ 0)
  y: number;
  zoom: number; // 1 = the photo just covers the frame
}

/**
 * Lets someone pick the part of a photo to use as their profile photo: drag to move, pinch, scroll
 * or use the slider to zoom. The circle shows how it will look; the saved photo is the full square.
 */
export default function AvatarCropper({ file, onCancel, onDone }: { file: Blob; onCancel: () => void; onDone: (photo: Blob) => void }) {
  const { t } = useI18n();
  const frameRef = useRef<HTMLDivElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [url, setUrl] = useState("");
  const [frame, setFrame] = useState(280);
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0, zoom: 1 });
  const [error, setError] = useState("");
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  // Load the photo (turned the right way up) and show it.
  useEffect(() => {
    let done = false;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    createImageBitmap(file, { imageOrientation: "from-image" }).then(
      (b) => (done ? b.close() : setBitmap(b)),
      () => setError(t("crop.unreadable")),
    );
    return () => {
      done = true;
      URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Scrolling over the photo zooms it instead of scrolling the sheet.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, [bitmap]);

  useEffect(() => () => bitmap?.close(), [bitmap]);

  // The frame is as wide as the sheet allows (max 320 px).
  useEffect(() => {
    const el = frameRef.current?.parentElement;
    if (el) setFrame(Math.min(320, Math.floor(el.clientWidth)));
  }, [bitmap]);

  const w = bitmap?.width ?? 1;
  const h = bitmap?.height ?? 1;
  const baseScale = frame / Math.min(w, h);

  /** Keeps the photo covering the whole frame. */
  function clamp(p: Pos): Pos {
    const zoom = Math.min(MAX_ZOOM, Math.max(1, p.zoom));
    const scale = baseScale * zoom;
    return {
      zoom,
      x: Math.min(0, Math.max(frame - w * scale, p.x)),
      y: Math.min(0, Math.max(frame - h * scale, p.y)),
    };
  }

  // Start centred whenever the photo or frame size changes.
  useEffect(() => {
    if (!bitmap) return;
    const scale = frame / Math.min(bitmap.width, bitmap.height);
    setPos({ zoom: 1, x: (frame - bitmap.width * scale) / 2, y: (frame - bitmap.height * scale) / 2 });
  }, [bitmap, frame]);

  /** Zooms keeping the point (cx, cy) of the frame where it is. */
  function zoomTo(zoom: number, cx = frame / 2, cy = frame / 2) {
    setPos((p) => {
      const old = baseScale * p.zoom;
      const next = baseScale * Math.min(MAX_ZOOM, Math.max(1, zoom));
      const ix = (cx - p.x) / old;
      const iy = (cy - p.y) / old;
      return clamp({ zoom, x: cx - ix * next, y: cy - iy * next });
    });
  }

  function local(e: React.PointerEvent) {
    const r = frameRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: pos.zoom };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = local(e);
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo((pinch.current.zoom * dist) / pinch.current.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else {
      setPos((p) => clamp({ ...p, x: p.x + now.x - prev.x, y: p.y + now.y - prev.y }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    const r = frameRef.current!.getBoundingClientRect();
    zoomTo(pos.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      setPos((p) => clamp({ ...p, x: p.x + moves[e.key][0], y: p.y + moves[e.key][1] }));
    } else if (e.key === "+" || e.key === "=") zoomTo(pos.zoom * 1.1);
    else if (e.key === "-") zoomTo(pos.zoom / 1.1);
  }

  function save() {
    if (!bitmap) return;
    const scale = baseScale * pos.zoom;
    const side = frame / scale; // the square of the photo inside the frame, in photo pixels
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.round(Math.min(OUTPUT, side));
    const ctx = canvas.getContext("2d");
    if (!ctx) return setError(t("crop.unreadable"));
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, -pos.x / scale, -pos.y / scale, side, side, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => (blob ? onDone(blob) : setError(t("crop.unreadable"))), "image/jpeg", 0.9);
  }

  const scale = baseScale * pos.zoom;

  // Rendered at the top level so it sits above the sheet that opened it.
  return createPortal(
    <Sheet title={t("crop.title")} onClose={onCancel}>
      <div className="stack cropper-wrap">
        {error ? (
          <p className="error">{error}</p>
        ) : (
          <>
            <div
              ref={frameRef}
              className="cropper"
              style={{ width: frame, height: frame }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
              onKeyDown={onKeyDown}
              tabIndex={0}
              role="application"
              aria-label={t("crop.hint")}
            >
              {bitmap && url && (
                <img
                  src={url}
                  alt=""
                  draggable={false}
                  style={{ width: w, height: h, transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
                />
              )}
              <div className="cropper-mask" aria-hidden="true" />
              {!bitmap && <div className="spinner dark center-spinner" />}
            </div>
            <p className="muted small center">{t("crop.hint")}</p>
            <label className="cropper-zoom">
              <span aria-hidden="true">−</span>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={pos.zoom}
                onChange={(e) => zoomTo(Number(e.target.value))}
                aria-label={t("crop.zoom")}
              />
              <span aria-hidden="true">+</span>
            </label>
          </>
        )}
        <div className="row gap">
          <button className="btn" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button className="btn primary grow" disabled={!bitmap} onClick={save}>
            {t("crop.use")}
          </button>
        </div>
      </div>
    </Sheet>,
    document.body,
  );
}

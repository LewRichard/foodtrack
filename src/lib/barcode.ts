import type { BarcodeProduct } from "../../shared/barcode.ts";
import type { Lang } from "../../shared/languages.ts";
import { API_BASE, ApiError } from "./api.ts";
import { t } from "../i18n/index.ts";

export type { BarcodeProduct };

/** Asks our server for the product (it looks it up on Open Food Facts). */
export async function lookupBarcode(code: string, lang: Lang, signal?: AbortSignal): Promise<BarcodeProduct> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/barcode/${encodeURIComponent(code)}?lang=${lang}`, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ApiError(t("err.network"), 0, "network");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error ?? t("common.requestFailed", { status: res.status }), res.status, body?.code);
  return body as BarcodeProduct;
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

export interface Detector {
  detect(source: HTMLVideoElement | ImageBitmap): Promise<{ rawValue: string }[]>;
}

/**
 * The browser's own barcode reader where it has one (Chrome on Android), else a WebAssembly
 * reader bundled with the app (iPhone, desktop). Loaded only when someone opens the scanner.
 */
export async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      if (supported.includes("ean_13")) return new Native({ formats: [...FORMATS] });
    } catch {
      // fall through to the bundled reader
    }
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  // Serve the reader from our own files instead of a CDN, so it works offline and in the iPhone app.
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
  });
  return new BarcodeDetector({ formats: [...FORMATS] });
}

export function cameraAvailable(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

import type { Lang } from "../../shared/languages.ts";
import type { AnalysisResult } from "../../shared/nutrition.ts";
import type { WeeklyReport } from "../../shared/report.ts";
import { t, type MessageKey } from "../i18n/index.ts";
import { accessToken } from "./cloud.ts";
import type { PreparedImage } from "./image.ts";

const CODE_KEY = "foodtrack:accessCode";

// Where the API lives. Empty in the browser build (same server as the page). The iPhone app runs from
// files bundled inside it, so it must be built with VITE_API_URL set to your online server.
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

/** An error from the API, with the server's machine-readable code when it sent one. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function getAccessCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAccessCode(code: string) {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    // Storage unavailable: the code just won't be remembered.
  }
}

async function request<T>(path: string, init: RequestInit, code = getAccessCode()): Promise<T> {
  // Signed-in users prove it with their account token, so they never need an access code.
  const token = await accessToken().catch(() => null);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(code ? { "x-access-code": code } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (e) {
    if (init.signal?.aborted) throw e;
    throw new ApiError(t("err.network"), 0, "network");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error ?? t("common.requestFailed", { status: res.status }), res.status, body?.code);
  return body as T;
}

export function analyzeImage(image: PreparedImage, note: string, language: Lang, signal?: AbortSignal): Promise<AnalysisResult> {
  return request<AnalysisResult>("/api/analyze", {
    method: "POST",
    body: JSON.stringify({ image: image.base64, mediaType: image.mediaType, note, language }),
    signal,
  });
}

/** Asks the AI for a check-in on the past week (see src/lib/report.ts for what's sent). */
export function fetchWeeklyReport(week: unknown, language: Lang, signal?: AbortSignal): Promise<WeeklyReport> {
  return request<WeeklyReport>("/api/report/weekly", { method: "POST", body: JSON.stringify({ week, language }), signal });
}

// Server error codes → messages in the app's language. Anything else shows the server's own text.
const ERROR_MESSAGES: Record<string, MessageKey> = {
  access_code_required: "err.accessCodeWrong",
  rate_limited: "err.rateLimited",
  daily_limit: "err.dailyLimit",
  ai_refused: "err.aiRefused",
  ai_unreadable: "err.aiUnreadable",
  busy: "err.busy",
  server_key: "err.serverKey",
  ai_error: "err.aiService",
  image_too_large: "err.imageTooLarge",
  bad_image: "err.badImage",
  server_error: "err.server",
  network: "err.network",
  barcode_unavailable: "err.barcodeUnavailable",
  bad_barcode: "barcode.invalid",
  sign_in_required: "report.signIn",
  bad_report: "err.server",
};

/** A message for any error, translated when the server sent a known code. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError && e.code && ERROR_MESSAGES[e.code]) return t(ERROR_MESSAGES[e.code]);
  return e instanceof Error ? e.message : String(e);
}

/** Checks an access code with the server (doesn't use up a scan) and remembers it if it's right. */
export async function unlock(code: string): Promise<void> {
  await request("/api/access", { method: "POST" }, code.trim());
  setAccessCode(code.trim());
}

export function isAccessError(e: unknown): boolean {
  return e instanceof ApiError && e.code === "access_code_required";
}

export function isSignInError(e: unknown): boolean {
  return e instanceof ApiError && e.code === "sign_in_required";
}

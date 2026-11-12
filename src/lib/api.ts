import type { Lang } from "../../shared/languages.ts";
import type { AnalysisResult } from "../../shared/nutrition.ts";
import type { MealPlan, PlanLength } from "../../shared/mealplan.ts";
import type { MenuContext, MenuResult } from "../../shared/menu.ts";
import type { LabelResult } from "../../shared/label.ts";
import type { WeeklyReport } from "../../shared/report.ts";
import { t, type MessageKey } from "../i18n/index.ts";
import { accessToken } from "./cloud.ts";
import type { PreparedImage } from "./image.ts";
import type { MealType } from "./types.ts";
import { todayKey } from "./dates.ts";

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
        "x-local-date": todayKey(), // free AI logs reset at the person's own midnight
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

export type TextAnalysis = AnalysisResult & { meal: MealType | null };

/** Turns a typed or dictated description of a meal into diary items. */
export function analyzeText(text: string, language: Lang, signal?: AbortSignal): Promise<TextAnalysis> {
  return request<TextAnalysis>("/api/analyze-text", { method: "POST", body: JSON.stringify({ text, language }), signal });
}

/** Reads a nutrition label from a photo. */
export function analyzeLabel(image: PreparedImage, language: Lang, signal?: AbortSignal): Promise<LabelResult> {
  return request<LabelResult>("/api/analyze-label", {
    method: "POST",
    body: JSON.stringify({ image: image.base64, mediaType: image.mediaType, language }),
    signal,
  });
}

/** Reads restaurant menu photos and rates each dish against what's left today. */
export function analyzeMenu(photos: PreparedImage[], context: MenuContext, language: Lang, signal?: AbortSignal): Promise<MenuResult> {
  return request<MenuResult>("/api/analyze-menu", {
    method: "POST",
    body: JSON.stringify({ photos: photos.map((p) => ({ image: p.base64, mediaType: p.mediaType })), context, language }),
    signal,
  });
}

/** Asks the AI for a check-in on the past week (see src/lib/report.ts for what's sent). */
export function fetchWeeklyReport(week: unknown, language: Lang, signal?: AbortSignal): Promise<WeeklyReport> {
  return request<WeeklyReport>("/api/report/weekly", { method: "POST", body: JSON.stringify({ week, language }), signal });
}

export interface PlanRequest {
  days: PlanLength;
  preferences: string;
  goals: unknown;
  profile: unknown;
  usualFoods: string[];
}

/** Asks the AI for a meal plan and shopping list. Can take a minute. */
export function fetchMealPlan(body: PlanRequest, language: Lang, signal?: AbortSignal): Promise<MealPlan> {
  return request<MealPlan>("/api/mealplan", { method: "POST", body: JSON.stringify({ ...body, language }), signal });
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Sends the conversation to Lew and calls `onText` with each piece of the reply as it arrives
 * (Server-Sent Events). Resolves when the reply is complete.
 */
export async function streamCoach(
  messages: ChatTurn[],
  context: unknown,
  language: Lang,
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<{ truncated: boolean }> {
  const token = await accessToken().catch(() => null);
  const code = getAccessCode();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/coach/chat`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "x-local-date": todayKey(),
        ...(code ? { "x-access-code": code } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages, context, language }),
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ApiError(t("err.network"), 0, "network");
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error ?? t("common.requestFailed", { status: res.status }), res.status, body?.code);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6)) as { type: string; text?: string; code?: string; truncated?: boolean };
      if (event.type === "text" && event.text) onText(event.text);
      else if (event.type === "done") return { truncated: Boolean(event.truncated) };
      else if (event.type === "error") {
        const code = event.code ?? "ai_error";
        throw new ApiError(ERROR_MESSAGES[code] ? t(ERROR_MESSAGES[code]) : t("err.aiService"), 200, code);
      }
    }
  }
  return { truncated: true }; // the connection ended before the reply finished
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
  scan_limit: "premium.limitReached",
  premium_required: "premium.required",
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

/** The free plan's daily AI logs are used up, or the feature needs Premium: show the upgrade screen. */
export function isPremiumError(e: unknown): boolean {
  return e instanceof ApiError && (e.code === "scan_limit" || e.code === "premium_required");
}

export interface PlanInfo {
  enforced: boolean; // false when the server doesn't limit anything (no accounts)
  premium: boolean;
  until: string | null;
  used: number; // free AI logs used today
  limit: number;
}

export function fetchPlan(): Promise<PlanInfo> {
  return request<PlanInfo>("/api/me/plan", { method: "GET" });
}

export function isSignInError(e: unknown): boolean {
  return e instanceof ApiError && e.code === "sign_in_required";
}

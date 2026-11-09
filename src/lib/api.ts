import type { AnalysisResult } from "../../shared/nutrition.ts";
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
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(code ? { "x-access-code": code } : {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status, body?.code);
  return body as T;
}

export function analyzeImage(image: PreparedImage, note: string, signal?: AbortSignal): Promise<AnalysisResult> {
  return request<AnalysisResult>("/api/analyze", {
    method: "POST",
    body: JSON.stringify({ image: image.base64, mediaType: image.mediaType, note }),
    signal,
  });
}

/** Checks an access code with the server (doesn't use up a scan) and remembers it if it's right. */
export async function unlock(code: string): Promise<void> {
  await request("/api/access", { method: "POST" }, code.trim());
  setAccessCode(code.trim());
}

export function isAccessError(e: unknown): boolean {
  return e instanceof ApiError && e.code === "access_code_required";
}

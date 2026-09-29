import type { AnalysisResult } from "../../shared/nutrition.ts";
import type { PreparedImage } from "./image.ts";

export async function analyzeImage(image: PreparedImage, note: string, signal?: AbortSignal): Promise<AnalysisResult> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: image.base64, mediaType: image.mediaType, note }),
    signal,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as AnalysisResult;
}

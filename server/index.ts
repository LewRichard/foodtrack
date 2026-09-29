import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AnalysisError, analyzeFoodImage, MODEL, type ImageMediaType } from "./analyze.ts";

const MEDIA_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Claude's per-image limit

const app = express();
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, hasKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) });
});

app.post("/api/analyze", async (req, res) => {
  const { image, mediaType, note } = req.body ?? {};
  if (typeof image !== "string" || !image) {
    res.status(400).json({ error: "Missing image (base64 string)." });
    return;
  }
  if (!MEDIA_TYPES.includes(mediaType)) {
    res.status(400).json({ error: `Unsupported image type. Use one of: ${MEDIA_TYPES.join(", ")}.` });
    return;
  }
  if (Buffer.byteLength(image, "base64") > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: "Image is larger than 5 MB." });
    return;
  }

  try {
    const result = await analyzeFoodImage(image, mediaType, typeof note === "string" ? note.slice(0, 500) : undefined);
    res.json(result);
  } catch (error) {
    if (error instanceof AnalysisError) {
      res.status(error.status).json({ error: error.message });
    } else if (error instanceof Anthropic.AuthenticationError) {
      res.status(500).json({ error: "Server API key is missing or invalid. Set ANTHROPIC_API_KEY." });
    } else if (error instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: "Too many requests — please try again in a moment." });
    } else if (error instanceof Anthropic.BadRequestError) {
      res.status(400).json({ error: `Request rejected: ${error.message}` });
    } else if (error instanceof Anthropic.APIError) {
      res.status(502).json({ error: `AI service error (${error.status ?? "network"}).` });
    } else {
      console.error(error);
      res.status(500).json({ error: "Unexpected server error." });
    }
  }
});

// In production, serve the built web app from the same origin.
if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`FoodTrack API listening on http://localhost:${port}`));

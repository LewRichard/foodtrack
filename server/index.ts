import Anthropic from "@anthropic-ai/sdk";
import express, { type RequestHandler } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AnalysisError, analyzeFoodImage, MODEL, type ImageMediaType } from "./analyze.ts";
import { supabaseVerifier } from "./auth.ts";
import { codeMatches, configFromEnv, cors, limitScans, requireScanAccess, ScanLimiter } from "./guard.ts";

const MEDIA_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Claude's per-image limit

const guard = configFromEnv();
const limiter = new ScanLimiter(guard.perIpPerHour, guard.dailyLimit);
const verifyUser = supabaseVerifier();

const app = express();
app.disable("x-powered-by");
// Hosting platforms (Render, Railway, Fly.io) put one proxy in front of the app;
// trusting it makes req.ip the visitor's address, which the rate limit relies on.
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));
app.use("/api", cors(guard));
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    requiresCode: Boolean(guard.accessCode),
    requiresSignIn: guard.requireSignIn,
    accounts: Boolean(verifyUser),
  });
});

// Lets the app check an access code without spending a scan.
app.post("/api/access", (req, res) => {
  if (codeMatches(guard.accessCode, req.get("x-access-code"))) res.json({ ok: true });
  else res.status(401).json({ error: "That access code isn't right.", code: "access_code_required" });
});

const validateUpload: RequestHandler = (req, res, next) => {
  const { image, mediaType } = req.body ?? {};
  if (typeof image !== "string" || !image) {
    res.status(400).json({ error: "Missing image (base64 string)." });
  } else if (!MEDIA_TYPES.includes(mediaType)) {
    res.status(400).json({ error: `Unsupported image type. Use one of: ${MEDIA_TYPES.join(", ")}.` });
  } else if (Buffer.byteLength(image, "base64") > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: "Image is larger than 5 MB." });
  } else {
    next();
  }
};

app.post("/api/analyze", requireScanAccess(guard, verifyUser), validateUpload, limitScans(limiter), async (req, res) => {
  const { image, mediaType, note } = req.body;
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

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found." });
});

// Serve the built web app (after `npm run build`) from the same origin as the API.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
if (existsSync(path.join(dist, "index.html"))) {
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`FoodTrack listening on http://localhost:${port}`);
  if (guard.requireSignIn && !verifyUser) {
    console.log("Warning: REQUIRE_SIGN_IN is on but Supabase isn't configured, so only the access code can unlock scanning.");
  }
  if (!guard.requireSignIn && !guard.accessCode) {
    console.log("Note: scanning is open to anyone who can reach this server (set REQUIRE_SIGN_IN or APP_ACCESS_CODE).");
  }
});

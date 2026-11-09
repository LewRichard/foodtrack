import Anthropic from "@anthropic-ai/sdk";
import express, { type RequestHandler } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AnalysisError, analyzeFoodImage, MODEL, type ImageMediaType } from "./analyze.ts";
import { supabaseVerifier } from "./auth.ts";
import { codeMatches, configFromEnv, cors, limitScans, requireScanAccess, ScanLimiter } from "./guard.ts";
import { pushConfigFromEnv, runReminders, sendPush, supabaseReminderDeps } from "./push.ts";

const MEDIA_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Claude's per-image limit

const guard = configFromEnv();
const limiter = new ScanLimiter(guard.perIpPerHour, guard.dailyLimit);
const verifyUser = supabaseVerifier();
const push = pushConfigFromEnv();

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
    reminders: Boolean(push),
  });
});

// ---- Meal reminders (web push) -------------------------------------------------------------------

// The app needs the public key to subscribe a device to notifications.
app.get("/api/push/config", (_req, res) => {
  res.json(push ? { enabled: true, publicKey: push.publicKey } : { enabled: false });
});

// Called every ~10 minutes by the scheduled job in Supabase (supabase/reminders-cron.sql).
app.post("/api/cron/reminders", async (req, res) => {
  if (!push?.db) {
    res.status(503).json({ error: "Reminders aren't configured on this server." });
    return;
  }
  if (!push.cronSecret || !codeMatches(push.cronSecret, req.get("x-cron-secret"))) {
    res.status(401).json({ error: "Wrong or missing x-cron-secret." });
    return;
  }
  try {
    res.json(await runReminders(supabaseReminderDeps(push.db)));
  } catch (e) {
    console.error("Reminder run failed:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// Sends a sample notification to the signed-in user's devices, to check reminders work.
app.post("/api/push/test", async (req, res) => {
  const token = /^Bearer\s+(.+)$/i.exec(req.get("authorization") ?? "")?.[1];
  const userId = token && verifyUser ? await verifyUser(token) : null;
  if (!userId) {
    res.status(401).json({ error: "Sign in first." });
    return;
  }
  if (!push?.db) {
    res.status(503).json({ error: "Reminders aren't configured on this server." });
    return;
  }
  const deps = supabaseReminderDeps(push.db);
  const subs = await deps.subscriptionsFor(userId);
  let sent = 0;
  for (const sub of subs) {
    try {
      await sendPush(sub, { title: "✅ Reminders are on", body: "This is how FoodTrack will remind you to log meals.", url: "/", tag: "test" });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await deps.deleteSubscription(sub.endpoint);
      else console.error("Test push failed:", e);
    }
  }
  res.json({ devices: subs.length, sent });
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
  if (!push) console.log("Meal reminders are off (set VAPID_* keys and SUPABASE_SERVICE_ROLE_KEY to turn them on).");
  else if (!push.cronSecret) console.log("Warning: CRON_SECRET is not set, so scheduled reminders will be refused.");
  if (guard.requireSignIn && !verifyUser) {
    console.log("Warning: REQUIRE_SIGN_IN is on but Supabase isn't configured, so only the access code can unlock scanning.");
  }
  if (!guard.requireSignIn && !guard.accessCode) {
    console.log("Note: scanning is open to anyone who can reach this server (set REQUIRE_SIGN_IN or APP_ACCESS_CODE).");
  }
});

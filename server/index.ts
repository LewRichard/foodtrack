import Anthropic from "@anthropic-ai/sdk";
import express, { type RequestHandler, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLang } from "../shared/languages.ts";
import { normalizeBarcode } from "../shared/barcode.ts";
import { BarcodeLookup, BarcodeLookupError } from "./barcode.ts";
import { AnalysisError, analyzeFoodImage, analyzeFoodText, MODEL, type ImageMediaType } from "./analyze.ts";
import { supabaseVerifier } from "./auth.ts";
import { codeMatches, configFromEnv, cors, limitScans, requireScanAccess, ScanLimiter } from "./guard.ts";
import { testReminderText } from "../shared/reminders.ts";
import { buildNotification, isNotifyKind, SentOnce, supabaseCommunityDeps } from "./communityPush.ts";
import { CoachRequestSchema, streamCoachReply } from "./coach.ts";
import { ReportInputSchema, writeWeeklyReport } from "./report.ts";
import { PlanRequestSchema, writeMealPlan } from "./mealplan.ts";
import { pushConfigFromEnv, runReminders, sendPush, supabaseReminderDeps } from "./push.ts";

const MEDIA_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Claude's per-image limit

const guard = configFromEnv();
const limiter = new ScanLimiter(guard.perIpPerHour, guard.dailyLimit);
const verifyUser = supabaseVerifier();
const push = pushConfigFromEnv();
const barcodes = new BarcodeLookup();
// Lookups are free for us but shouldn't let one visitor hammer Open Food Facts through this server.
const barcodeLimiter = new ScanLimiter(120, 20000);

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
      await sendPush(sub, { ...testReminderText(req.body?.language), url: "/", tag: "test" });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await deps.deleteSubscription(sub.endpoint);
      else console.error("Test push failed:", e);
    }
  }
  res.json({ devices: subs.length, sent });
});

// The app reports something the person just did in Community (message, comment, like, friend
// request); we check it really happened and notify the other person's devices.
const notifyLimiter = new ScanLimiter(120, 100_000);
const notified = new SentOnce();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.post("/api/community/notify", async (req, res) => {
  const token = /^Bearer\s+(.+)$/i.exec(req.get("authorization") ?? "")?.[1];
  const userId = token && verifyUser ? await verifyUser(token) : null;
  if (!userId) {
    res.status(401).json({ error: "Sign in first." });
    return;
  }
  const { kind, id } = req.body ?? {};
  if (!isNotifyKind(kind) || typeof id !== "string" || !UUID.test(id)) {
    res.status(400).json({ error: "Expected { kind, id }." });
    return;
  }
  if (!push?.db) {
    res.json({ sent: 0, reason: "push not configured" });
    return;
  }
  if (notifyLimiter.take(`user:${userId}`)) {
    res.status(429).json({ error: "Too many notifications.", code: "rate_limited" });
    return;
  }
  try {
    const note = await buildNotification(supabaseCommunityDeps(push.db), userId, kind, id);
    // Each event is announced once (liking, unliking and liking again doesn't send it twice).
    if (!note || !notified.first(`${kind}:${id}:${userId}`)) {
      res.json({ sent: 0 });
      return;
    }
    const deps = supabaseReminderDeps(push.db);
    let sent = 0;
    for (const sub of await deps.subscriptionsFor(note.to)) {
      try {
        await sendPush(sub, { ...note.message, quietWhenOpen: true });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await deps.deleteSubscription(sub.endpoint);
        else console.error("Community push failed:", e);
      }
    }
    res.json({ sent });
  } catch (e) {
    console.error("Community notify failed:", e);
    res.status(500).json({ error: "Couldn't send the notification." });
  }
});

// Lets the app check an access code without spending a scan.
app.post("/api/access", (req, res) => {
  if (codeMatches(guard.accessCode, req.get("x-access-code"))) res.json({ ok: true });
  else res.status(401).json({ error: "That access code isn't right.", code: "access_code_required" });
});

const validateUpload: RequestHandler = (req, res, next) => {
  const { image, mediaType } = req.body ?? {};
  if (typeof image !== "string" || !image) {
    res.status(400).json({ error: "Missing image (base64 string).", code: "bad_image" });
  } else if (!MEDIA_TYPES.includes(mediaType)) {
    res.status(400).json({ error: `Unsupported image type. Use one of: ${MEDIA_TYPES.join(", ")}.`, code: "bad_image" });
  } else if (Buffer.byteLength(image, "base64") > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: "Image is larger than 5 MB.", code: "image_too_large" });
  } else {
    next();
  }
};

/** Turns an error from a Claude request into the API's JSON error with a code the app understands. */
function sendAiError(res: Response, error: unknown) {
  if (error instanceof AnalysisError) {
    res.status(error.status).json({ error: error.message, code: error.code });
  } else if (error instanceof Anthropic.AuthenticationError) {
    res.status(500).json({ error: "Server API key is missing or invalid. Set ANTHROPIC_API_KEY.", code: "server_key" });
  } else if (error instanceof Anthropic.RateLimitError) {
    res.status(429).json({ error: "Too many requests — please try again in a moment.", code: "busy" });
  } else if (error instanceof Anthropic.BadRequestError) {
    res.status(400).json({ error: `Request rejected: ${error.message}`, code: "bad_image" });
  } else if (error instanceof Anthropic.APIError) {
    res.status(502).json({ error: `AI service error (${error.status ?? "network"}).`, code: "ai_error" });
  } else {
    console.error(error);
    res.status(500).json({ error: "Unexpected server error.", code: "server_error" });
  }
}

app.post("/api/analyze", requireScanAccess(guard, verifyUser), validateUpload, limitScans(limiter), async (req, res) => {
  const { image, mediaType, note, language } = req.body;
  try {
    const result = await analyzeFoodImage(
      image,
      mediaType,
      typeof note === "string" ? note.slice(0, 500) : undefined,
      isLang(language) ? language : "en",
    );
    res.json(result);
  } catch (error) {
    sendAiError(res, error);
  }
});

// Log a meal by describing it ("trưa nay ăn 1 tô bún bò với ly trà đá"). Shares the scan limits.
app.post("/api/analyze-text", requireScanAccess(guard, verifyUser), limitScans(limiter), async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text || text.length > 500) {
    res.status(400).json({ error: "Describe what you ate in up to 500 characters.", code: "bad_text" });
    return;
  }
  const language = isLang(req.body?.language) ? req.body.language : "en";
  try {
    res.json(await analyzeFoodText(text, language));
  } catch (error) {
    sendAiError(res, error);
  }
});

// The AI weekly check-in. Costs about as much as a scan, so it shares the scan limits.
app.post("/api/report/weekly", requireScanAccess(guard, verifyUser), limitScans(limiter), async (req, res) => {
  const parsed = ReportInputSchema.safeParse(req.body?.week);
  if (!parsed.success) {
    res.status(400).json({ error: "The week's data isn't in the expected format.", code: "bad_report" });
    return;
  }
  const language = isLang(req.body?.language) ? req.body.language : "en";
  try {
    res.json(await writeWeeklyReport(parsed.data, language));
  } catch (error) {
    sendAiError(res, error);
  }
});

// AI meal plan + shopping list. Costs about as much as a scan or two, so it shares the scan limits.
app.post("/api/mealplan", requireScanAccess(guard, verifyUser), limitScans(limiter), async (req, res) => {
  const parsed = PlanRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The meal plan request isn't in the expected format.", code: "bad_report" });
    return;
  }
  const language = isLang(req.body?.language) ? req.body.language : "en";
  try {
    res.json(await writeMealPlan(parsed.data, language));
  } catch (error) {
    sendAiError(res, error);
  }
});

// Chat with Lew, the AI nutritionist (streams the reply). Its own, looser limits than photo scans.
const chatLimiter = new ScanLimiter(60, 3000);
app.post("/api/coach/chat", requireScanAccess(guard, verifyUser), limitScans(chatLimiter), async (req, res) => {
  const parsed = CoachRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The chat request isn't in the expected format.", code: "bad_report" });
    return;
  }
  const language = isLang(req.body?.language) ? req.body.language : "en";
  await streamCoachReply(parsed.data, language, res);
});

// Packaged food by barcode (Open Food Facts). Free, so no sign-in needed; just rate-limited.
app.get("/api/barcode/:code", async (req, res) => {
  const code = normalizeBarcode(String(req.params.code));
  if (!code) {
    res.status(400).json({ error: "A barcode is 8–14 digits.", code: "bad_barcode" });
    return;
  }
  if (barcodeLimiter.take(`ip:${req.ip}`)) {
    res.status(429).json({ error: "Too many lookups — please wait a little.", code: "rate_limited" });
    return;
  }
  const lang = typeof req.query.lang === "string" && isLang(req.query.lang) ? req.query.lang : "en";
  try {
    const product = await barcodes.find(code, lang);
    if (product) res.json(product);
    else res.status(404).json({ error: "No product found for this barcode.", code: "barcode_not_found" });
  } catch (e) {
    if (!(e instanceof BarcodeLookupError)) console.error(e);
    res.status(502).json({ error: "Couldn't reach the product database.", code: "barcode_unavailable" });
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found." });
});

// Anything unexpected: a plain JSON error, never a stack trace.
app.use(((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return res.end();
  const status = (error as { status?: number }).status;
  res
    .status(status && status >= 400 && status < 500 ? status : 500)
    .json({ error: status && status < 500 ? "Bad request." : "Unexpected server error.", code: "server_error" });
}) as express.ErrorRequestHandler);

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

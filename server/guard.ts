import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

// Protection for the paid /api/analyze endpoint once the server is public:
//  - an optional shared access code (APP_ACCESS_CODE), so only people you give it to can scan
//  - a per-IP hourly limit, so one person can't run up the bill
//  - a server-wide daily cap, a hard ceiling on what a day can cost
// Counters live in memory: they reset when the server restarts, which is fine for one instance.

export interface GuardConfig {
  accessCode: string;
  perIpPerHour: number;
  dailyLimit: number;
  allowedOrigins: string[];
}

// The iPhone app (Capacitor) loads its pages from capacitor://localhost, a different origin
// from the server, so the browser engine needs CORS permission to call the API.
const DEFAULT_ORIGINS = ["capacitor://localhost"];

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): GuardConfig {
  const int = (value: string | undefined, fallback: number) => {
    const n = Number.parseInt(value ?? "", 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    accessCode: (env.APP_ACCESS_CODE ?? "").trim(),
    perIpPerHour: int(env.SCANS_PER_IP_PER_HOUR, 30),
    dailyLimit: int(env.DAILY_SCAN_LIMIT, 300),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS.join(","))
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  };
}

export function codeMatches(expected: string, given: unknown): boolean {
  if (!expected) return true;
  if (typeof given !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

const HOUR = 60 * 60 * 1000;

/** Sliding one-hour window per key, plus a calendar-day (UTC) total. */
export class ScanLimiter {
  private hits = new Map<string, number[]>();
  private day = "";
  private dayCount = 0;

  constructor(
    private readonly perKeyPerHour: number,
    private readonly perDay: number,
  ) {}

  /** Records a scan if allowed. Returns null when allowed, or the reason it was refused. */
  take(key: string, now = Date.now()): null | "ip" | "daily" {
    const today = new Date(now).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.dayCount = 0;
    }
    if (this.perDay > 0 && this.dayCount >= this.perDay) return "daily";

    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < HOUR);
    if (this.perKeyPerHour > 0 && recent.length >= this.perKeyPerHour) {
      this.hits.set(key, recent);
      return "ip";
    }
    recent.push(now);
    this.hits.set(key, recent);
    this.dayCount++;
    this.prune(now);
    return null;
  }

  private prune(now: number) {
    if (this.hits.size < 5000) return;
    for (const [k, list] of this.hits) if (list.every((t) => now - t >= HOUR)) this.hits.delete(k);
  }
}

export function requireAccessCode(config: GuardConfig): RequestHandler {
  return (req, res, next) => {
    if (codeMatches(config.accessCode, req.get("x-access-code"))) return next();
    res.status(401).json({ error: "This app needs an access code.", code: "access_code_required" });
  };
}

export function limitScans(limiter: ScanLimiter): RequestHandler {
  return (req, res, next) => {
    const refused = limiter.take(req.ip ?? "unknown");
    if (refused === "ip") {
      res.status(429).json({ error: "You've reached the hourly scan limit. Try again later.", code: "rate_limited" });
    } else if (refused === "daily") {
      res.status(429).json({ error: "The app has reached today's scan limit. Try again tomorrow.", code: "daily_limit" });
    } else {
      next();
    }
  };
}

/** Lets the listed origins (the iPhone app) call the API. Same-origin web requests need nothing. */
export function cors(config: GuardConfig): RequestHandler {
  return (req, res, next) => {
    const origin = req.get("origin");
    if (origin && config.allowedOrigins.includes(origin)) {
      res.set({
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Access-Code",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      });
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}

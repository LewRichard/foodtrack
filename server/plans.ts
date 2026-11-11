// Free and Premium plans. Free accounts get a few AI meal logs (photo or description) a day;
// Premium removes that limit and unlocks chat with Lew, meal plans and the weekly check-in.
// Usage and Premium live in Supabase (supabase/premium.sql) and only this server can change them.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RequestHandler } from "express";
import { projectUrl, supabaseKey } from "../shared/supabase.ts";

export interface PlanStore {
  /** Premium right now? */
  isPremium(userId: string): Promise<boolean>;
  /** When Premium ends (null = no end), or undefined when not Premium. */
  premiumUntil(userId: string): Promise<string | null | undefined>;
  /** Counts one AI log if under the limit. Returns the new count, or null when the limit is reached. */
  take(userId: string, day: string, limit: number): Promise<number | null>;
  /** Undoes a take() whose AI call failed. */
  giveBack(userId: string, day: string): Promise<void>;
  used(userId: string, day: string): Promise<number>;
  /** Grants or extends Premium from a purchase (until null = no end date). */
  grant(userId: string, grant: PremiumGrant): Promise<void>;
  /** Ends Premium that came from this subscription (manual grants are left alone). */
  revoke(userId: string, subscriptionId: string): Promise<void>;
  /** The payment provider's customer id behind someone's Premium, if any. */
  customer(userId: string): Promise<{ customerId: string; subscriptionId: string | null } | null>;
}

export interface PremiumGrant {
  until: string | null;
  source: string;
  subscriptionId: string | null;
  customerId: string | null;
}

export interface PlanConfig {
  freeScansPerDay: number;
}

export function planConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PlanConfig {
  const n = Number.parseInt(env.FREE_SCANS_PER_DAY ?? "", 10);
  return { freeScansPerDay: Number.isFinite(n) && n >= 0 ? n : 5 };
}

/** Supabase-backed store, or null when the server has no service-role key (then nothing is limited). */
export function supabasePlanStore(env: NodeJS.ProcessEnv = process.env): PlanStore | null {
  const url = projectUrl(env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? "");
  const key = supabaseKey(env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  if (!url || !key) return null;
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const cache = new Map<string, { until: string | null | undefined; at: number }>();
  async function until(userId: string): Promise<string | null | undefined> {
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < 60_000) return hit.until;
    const { data, error } = await db.from("premium").select("until").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    const value = data ? ((data as { until: string | null }).until ?? null) : undefined;
    // Only Premium is remembered (for a minute), so someone who just paid sees it straight away.
    if (cache.size > 5000) cache.clear();
    if (value !== undefined) cache.set(userId, { until: value, at: Date.now() });
    return value;
  }

  return {
    async premiumUntil(userId) {
      const u = await until(userId);
      return u === undefined || (u !== null && Date.parse(u) <= Date.now()) ? undefined : u;
    },
    async isPremium(userId) {
      return (await this.premiumUntil(userId)) !== undefined;
    },
    async take(userId, day, limit) {
      const { data, error } = await db.rpc("take_ai_scan", { p_user: userId, p_day: day, p_limit: limit });
      if (error) throw new Error(error.message);
      return typeof data === "number" ? data : null;
    },
    async giveBack(userId, day) {
      await db.rpc("give_back_ai_scan", { p_user: userId, p_day: day });
    },
    async grant(userId, g) {
      cache.delete(userId);
      const { error } = await db.from("premium").upsert(
        { user_id: userId, until: g.until, source: g.source, subscription_id: g.subscriptionId, customer_id: g.customerId, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
    },
    async revoke(userId, subscriptionId) {
      cache.delete(userId);
      const { error } = await db.from("premium").delete().eq("user_id", userId).eq("subscription_id", subscriptionId);
      if (error) throw new Error(error.message);
    },
    async customer(userId) {
      const { data, error } = await db.from("premium").select("customer_id, subscription_id").eq("user_id", userId).maybeSingle();
      if (error) throw new Error(error.message);
      const row = data as { customer_id: string | null; subscription_id: string | null } | null;
      return row?.customer_id ? { customerId: row.customer_id, subscriptionId: row.subscription_id } : null;
    },
    async used(userId, day) {
      const { data, error } = await db.from("ai_usage").select("scans").eq("user_id", userId).eq("day", day).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as { scans: number } | null)?.scans ?? 0;
    },
  };
}

/** In-memory store for tests. */
export function memoryPlanStore(premium: Record<string, string | null> = {}): PlanStore & { usage: Map<string, number>; grants: Map<string, PremiumGrant> } {
  const usage = new Map<string, number>();
  const grants = new Map<string, PremiumGrant>();
  const key = (u: string, d: string) => `${u}|${d}`;
  return {
    usage,
    grants,
    async grant(userId, g) {
      grants.set(userId, g);
      premium[userId] = g.until;
    },
    async revoke(userId, subscriptionId) {
      if (grants.get(userId)?.subscriptionId === subscriptionId) {
        grants.delete(userId);
        delete premium[userId];
      }
    },
    async customer(userId) {
      const g = grants.get(userId);
      return g?.customerId ? { customerId: g.customerId, subscriptionId: g.subscriptionId } : null;
    },
    async premiumUntil(userId) {
      if (!(userId in premium)) return undefined;
      const u = premium[userId];
      return u !== null && Date.parse(u) <= Date.now() ? undefined : u;
    },
    async isPremium(userId) {
      return (await this.premiumUntil(userId)) !== undefined;
    },
    async take(userId, day, limit) {
      const n = usage.get(key(userId, day)) ?? 0;
      if (n >= limit) return null;
      usage.set(key(userId, day), n + 1);
      return n + 1;
    },
    async giveBack(userId, day) {
      const n = usage.get(key(userId, day)) ?? 0;
      usage.set(key(userId, day), Math.max(0, n - 1));
    },
    async used(userId, day) {
      return usage.get(key(userId, day)) ?? 0;
    },
  };
}

/**
 * The person's own calendar day, so the daily limit resets at their midnight. The app sends it in
 * x-local-date; anything more than a day away from UTC is ignored (it can't stretch the limit).
 */
export function usageDay(header: string | undefined, now = new Date()): string {
  const utc = now.toISOString().slice(0, 10);
  if (!header || !/^\d{4}-\d{2}-\d{2}$/.test(header)) return utc;
  const diff = Math.abs(Date.parse(`${header}T00:00:00Z`) - Date.parse(`${utc}T00:00:00Z`));
  return diff <= 86_400_000 ? header : utc;
}

/**
 * Counts an AI meal log for free accounts and refuses once the day's limit is used. Premium and
 * access-code users (no account) aren't counted. Sets res.locals.giveBack to undo it on failure.
 */
export function limitFreeScans(store: PlanStore | null, config: PlanConfig): RequestHandler {
  return async (req, res, next) => {
    const userId: string | null = res.locals.userId ?? null;
    if (!store || !userId) return next();
    try {
      if (await store.isPremium(userId)) return next();
      const day = usageDay(req.get("x-local-date"));
      const n = await store.take(userId, day, config.freeScansPerDay);
      if (n === null) {
        res.status(429).json({
          error: `You've used today's ${config.freeScansPerDay} free AI logs. Upgrade to Premium for unlimited.`,
          code: "scan_limit",
          limit: config.freeScansPerDay,
        });
        return;
      }
      res.locals.giveBack = () => store.giveBack(userId, day).catch(() => {});
      res.setHeader("x-ai-used", String(n));
      res.setHeader("x-ai-limit", String(config.freeScansPerDay));
      next();
    } catch (e) {
      // Usage tracking is down: don't block people from logging their food.
      console.error("Plan check failed:", e);
      next();
    }
  };
}

/** Lets only Premium accounts through (access-code users and servers without plans aren't limited). */
export function requirePremium(store: PlanStore | null): RequestHandler {
  return async (_req, res, next) => {
    const userId: string | null = res.locals.userId ?? null;
    if (!store || !userId) return next();
    try {
      if (await store.isPremium(userId)) return next();
    } catch (e) {
      console.error("Premium check failed:", e);
      res.status(503).json({ error: "Couldn't check your plan. Try again in a moment.", code: "busy" });
      return;
    }
    res.status(403).json({ error: "This is a Premium feature.", code: "premium_required" });
  };
}

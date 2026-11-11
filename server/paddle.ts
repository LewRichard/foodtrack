// Paddle Billing: the app opens Paddle's checkout (Paddle.js) and Paddle tells this server about
// payments through a signed webhook, which turns Premium on, extends it, or ends it.
// Paddle is the merchant of record, so it handles tax, invoices and refunds.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlanStore } from "./plans.ts";

export interface PaddleConfig {
  environment: "sandbox" | "production";
  clientToken: string; // public: lets the app open checkout
  prices: { monthly: string; yearly: string }; // price ids (pri_…); either may be empty
  webhookSecret: string; // from Paddle → Notifications
  apiKey: string; // optional: lets people open Paddle's page to manage or cancel
}

export function paddleConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PaddleConfig | null {
  const clientToken = (env.PADDLE_CLIENT_TOKEN ?? "").trim();
  const monthly = (env.PADDLE_PRICE_MONTHLY ?? "").trim();
  const yearly = (env.PADDLE_PRICE_YEARLY ?? "").trim();
  if (!clientToken || (!monthly && !yearly)) return null;
  return {
    environment: /^sandbox$/i.test((env.PADDLE_ENV ?? "").trim()) || clientToken.startsWith("test_") ? "sandbox" : "production",
    clientToken,
    prices: { monthly, yearly },
    webhookSecret: (env.PADDLE_WEBHOOK_SECRET ?? "").trim(),
    apiKey: (env.PADDLE_API_KEY ?? "").trim(),
  };
}

const TOLERANCE_S = 5 * 60;

/**
 * Checks the Paddle-Signature header ("ts=…;h1=…"): an HMAC-SHA256 of "ts:body" with the webhook
 * secret. Rejects old timestamps so a captured request can't be replayed later.
 */
export function verifyPaddleSignature(header: string | undefined, rawBody: string, secret: string, nowS = Date.now() / 1000): boolean {
  if (!header || !secret) return false;
  const parts = header.split(";").map((p) => p.split("=") as [string, string]);
  const ts = parts.find(([k]) => k === "ts")?.[1];
  const signatures = parts.filter(([k]) => k === "h1").map(([, v]) => v);
  if (!ts || !/^\d+$/.test(ts) || !signatures.length) return false;
  if (Math.abs(nowS - Number(ts)) > TOLERANCE_S) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex"));
  return signatures.some((sig) => {
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

interface PaddleSubscription {
  id: string;
  status: "active" | "trialing" | "past_due" | "paused" | "canceled";
  customer_id?: string;
  custom_data?: { user_id?: unknown } | null;
  current_billing_period?: { ends_at?: string } | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRACE_MS = 3 * 24 * 60 * 60 * 1000; // a few days' slack if a renewal arrives late

/** What a webhook event means for someone's Premium. Exported for tests. */
export function premiumChange(event: { event_type?: string; data?: unknown }):
  | { kind: "grant"; userId: string; until: string | null; subscriptionId: string; customerId: string | null }
  | { kind: "revoke"; userId: string; subscriptionId: string }
  | null {
  if (!event.event_type?.startsWith("subscription.")) return null;
  const sub = event.data as PaddleSubscription | undefined;
  const userId = sub?.custom_data?.user_id;
  if (!sub?.id || typeof userId !== "string" || !UUID.test(userId)) return null;
  if (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due") {
    const ends = sub.current_billing_period?.ends_at;
    const until = ends && !Number.isNaN(Date.parse(ends)) ? new Date(Date.parse(ends) + GRACE_MS).toISOString() : null;
    return { kind: "grant", userId, until, subscriptionId: sub.id, customerId: sub.customer_id ?? null };
  }
  return { kind: "revoke", userId, subscriptionId: sub.id };
}

/** Applies a verified webhook event. Returns what happened, for the log. */
export async function handlePaddleEvent(event: { event_type?: string; data?: unknown }, store: PlanStore): Promise<string> {
  const change = premiumChange(event);
  if (!change) return `ignored ${event.event_type ?? "?"}`;
  if (change.kind === "grant") {
    await store.grant(change.userId, { until: change.until, source: "paddle", subscriptionId: change.subscriptionId, customerId: change.customerId });
    return `premium on for ${change.userId} until ${change.until ?? "open-ended"}`;
  }
  await store.revoke(change.userId, change.subscriptionId);
  return `premium off for ${change.userId}`;
}

/** A link to Paddle's customer portal, where people manage or cancel (needs PADDLE_API_KEY). */
export async function portalLink(config: PaddleConfig, customerId: string, subscriptionId: string | null, fetchFn: typeof fetch = fetch): Promise<string | null> {
  if (!config.apiKey) return null;
  const base = config.environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const res = await fetchFn(`${base}/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(subscriptionId ? { subscription_ids: [subscriptionId] } : {}),
  });
  if (!res.ok) throw new Error(`Paddle portal request failed (${res.status})`);
  const body = (await res.json()) as { data?: { urls?: { general?: { overview?: string } } } };
  return body.data?.urls?.general?.overview ?? null;
}

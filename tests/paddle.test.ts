import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handlePaddleEvent, paddleConfigFromEnv, premiumChange, verifyPaddleSignature } from "../server/paddle.ts";
import { memoryPlanStore } from "../server/plans.ts";

const SECRET = "pdl_ntfset_test_secret";
const sign = (body: string, ts: number, secret = SECRET) => `ts=${ts};h1=${createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex")}`;
const USER = "11111111-1111-4111-8111-111111111111";
const sub = (status: string, extra: Record<string, unknown> = {}) => ({
  event_type: "subscription.updated",
  data: { id: "sub_01", status, customer_id: "ctm_01", custom_data: { user_id: USER }, current_billing_period: { ends_at: "2026-12-11T00:00:00Z" }, ...extra },
});

describe("verifyPaddleSignature", () => {
  const body = JSON.stringify(sub("active"));
  const now = 1_800_000_000;
  it("accepts a correct, recent signature", () => {
    expect(verifyPaddleSignature(sign(body, now), body, SECRET, now + 10)).toBe(true);
  });
  it("rejects a changed body, wrong secret, old timestamp or junk", () => {
    expect(verifyPaddleSignature(sign(body, now), body.replace("active", "canceled"), SECRET, now)).toBe(false);
    expect(verifyPaddleSignature(sign(body, now, "other"), body, SECRET, now)).toBe(false);
    expect(verifyPaddleSignature(sign(body, now), body, SECRET, now + 3600)).toBe(false);
    expect(verifyPaddleSignature("nonsense", body, SECRET, now)).toBe(false);
    expect(verifyPaddleSignature(undefined, body, SECRET, now)).toBe(false);
    expect(verifyPaddleSignature(sign(body, now), body, "", now)).toBe(false);
  });
});

describe("premiumChange", () => {
  it("turns Premium on until the end of the billing period (plus a few days)", () => {
    expect(premiumChange(sub("active"))).toEqual({ kind: "grant", userId: USER, until: "2026-12-14T00:00:00.000Z", subscriptionId: "sub_01", customerId: "ctm_01" });
    expect(premiumChange(sub("trialing"))?.kind).toBe("grant");
    expect(premiumChange(sub("past_due"))?.kind).toBe("grant");
  });
  it("turns it off when cancelled or paused", () => {
    expect(premiumChange(sub("canceled"))).toEqual({ kind: "revoke", userId: USER, subscriptionId: "sub_01" });
    expect(premiumChange(sub("paused"))?.kind).toBe("revoke");
  });
  it("ignores other events and missing or odd user ids", () => {
    expect(premiumChange({ event_type: "transaction.completed", data: {} })).toBeNull();
    expect(premiumChange(sub("active", { custom_data: null }))).toBeNull();
    expect(premiumChange(sub("active", { custom_data: { user_id: "'; drop table" } }))).toBeNull();
  });
});

describe("handlePaddleEvent", () => {
  it("grants, then revokes only the same subscription", async () => {
    const store = memoryPlanStore();
    await handlePaddleEvent(sub("active"), store);
    expect(await store.isPremium(USER)).toBe(true);
    expect(await store.customer(USER)).toEqual({ customerId: "ctm_01", subscriptionId: "sub_01" });
    await handlePaddleEvent({ ...sub("canceled"), data: { ...sub("canceled").data, id: "sub_other" } }, store);
    expect(await store.isPremium(USER)).toBe(true);
    await handlePaddleEvent(sub("canceled"), store);
    expect(await store.isPremium(USER)).toBe(false);
  });
});

describe("paddleConfigFromEnv", () => {
  it("is off without a client token and a price, and spots sandbox tokens", () => {
    expect(paddleConfigFromEnv({})).toBeNull();
    expect(paddleConfigFromEnv({ PADDLE_CLIENT_TOKEN: "test_abc" })).toBeNull();
    expect(paddleConfigFromEnv({ PADDLE_CLIENT_TOKEN: "test_abc", PADDLE_PRICE_MONTHLY: "pri_1" })?.environment).toBe("sandbox");
    expect(paddleConfigFromEnv({ PADDLE_CLIENT_TOKEN: "live_abc", PADDLE_PRICE_YEARLY: "pri_2" })?.environment).toBe("production");
  });
});

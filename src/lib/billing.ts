// Buying Premium with Paddle. The server says whether payments are set up (/api/billing/config);
// Paddle.js shows prices in the buyer's currency and opens Paddle's own checkout over the app.
// After payment, Paddle tells the server (webhook) and the app picks up Premium by re-reading the plan.

import { useEffect, useState } from "react";
import { API_BASE, ApiError } from "./api.ts";
import { accessToken } from "./cloud.ts";
import { getPlan, refreshPlan } from "./plan.ts";

export interface BillingConfig {
  provider: "paddle" | null;
  environment?: "sandbox" | "production";
  clientToken?: string;
  prices?: { monthly: string; yearly: string };
  portal?: boolean;
}

interface PaddleJs {
  Environment: { set(env: string): void };
  Initialize(options: { token: string; eventCallback?: (event: { name?: string }) => void }): void;
  PricePreview(request: { items: { priceId: string; quantity: number }[] }): Promise<{
    data: { details: { lineItems: { price: { id: string }; formattedTotals: { total: string } }[] } };
  }>;
  Checkout: {
    open(options: {
      items: { priceId: string; quantity: number }[];
      customer?: { email: string };
      customData?: Record<string, string>;
      settings?: { displayMode?: "overlay"; theme?: "light" | "dark"; locale?: string };
    }): void;
  };
}

declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

let configPromise: Promise<BillingConfig> | null = null;

export function billingConfig(): Promise<BillingConfig> {
  configPromise ??= fetch(`${API_BASE}/api/billing/config`)
    .then((r) => (r.ok ? (r.json() as Promise<BillingConfig>) : { provider: null }))
    .catch(() => {
      configPromise = null; // try again next time
      return { provider: null } as BillingConfig;
    });
  return configPromise;
}

export function useBillingConfig(): BillingConfig | null {
  const [config, setConfig] = useState<BillingConfig | null>(null);
  useEffect(() => {
    let live = true;
    void billingConfig().then((c) => live && setConfig(c));
    return () => {
      live = false;
    };
  }, []);
  return config;
}

let paddlePromise: Promise<PaddleJs> | null = null;

function loadPaddle(config: BillingConfig): Promise<PaddleJs> {
  paddlePromise ??= new Promise<PaddleJs>((resolve, reject) => {
    const ready = () => {
      const Paddle = window.Paddle;
      if (!Paddle || !config.clientToken) return reject(new Error("Paddle didn't load"));
      if (config.environment === "sandbox") Paddle.Environment.set("sandbox");
      Paddle.Initialize({
        token: config.clientToken,
        eventCallback: (event) => {
          if (event.name === "checkout.completed") void waitForPremium();
        },
      });
      resolve(Paddle);
    };
    if (window.Paddle) return ready();
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = ready;
    script.onerror = () => {
      paddlePromise = null;
      reject(new Error("Couldn't load the payment page. Check your connection."));
    };
    document.head.appendChild(script);
  });
  return paddlePromise;
}

/** Prices in the buyer's own currency, keyed by price id. */
export async function localPrices(config: BillingConfig): Promise<Record<string, string>> {
  const ids = [config.prices?.monthly, config.prices?.yearly].filter((id): id is string => Boolean(id));
  if (!ids.length) return {};
  const Paddle = await loadPaddle(config);
  const preview = await Paddle.PricePreview({ items: ids.map((priceId) => ({ priceId, quantity: 1 })) });
  return Object.fromEntries(preview.data.details.lineItems.map((li) => [li.price.id, li.formattedTotals.total]));
}

// Paddle's checkout languages differ slightly from the app's codes.
const PADDLE_LOCALE: Record<string, string> = { zh: "zh-Hans" };

export async function openCheckout(config: BillingConfig, priceId: string, user: { id: string; email?: string }, lang: string): Promise<void> {
  const Paddle = await loadPaddle(config);
  Paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    ...(user.email ? { customer: { email: user.email } } : {}),
    customData: { user_id: user.id }, // how the server knows whose Premium to turn on
    settings: {
      displayMode: "overlay",
      theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      locale: PADDLE_LOCALE[lang] ?? lang,
    },
  });
}

/** After paying, Paddle notifies the server within seconds; keep checking until Premium shows up. */
async function waitForPremium(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    await refreshPlan();
    if (getPlan()?.premium) return;
  }
}

/** Opens Paddle's page for updating the card or cancelling. */
export async function openPortal(): Promise<void> {
  const token = await accessToken().catch(() => null);
  const res = await fetch(`${API_BASE}/api/billing/portal`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = (await res.json().catch(() => null)) as { url?: string; error?: string; code?: string } | null;
  if (!res.ok || !body?.url) throw new ApiError(body?.error ?? "Couldn't open the subscription page.", res.status, body?.code);
  window.open(body.url, "_blank", "noopener");
}

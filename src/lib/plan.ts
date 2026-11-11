// The signed-in person's plan (free or Premium) as the server sees it, shared by every screen,
// plus the upgrade screen that any screen can open. The server enforces the limits; this only
// shows them, so a stale value here can never unlock anything.

import { useEffect, useSyncExternalStore } from "react";
import { fetchPlan, type PlanInfo } from "./api.ts";

let plan: PlanInfo | null = null;
let paywall: PaywallReason | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export type PaywallReason = "limit" | "feature" | "info";

export function usePlan(): PlanInfo | null {
  return useSyncExternalStore(subscribe, () => plan);
}

/** True when this feature is Premium-only for this person (false while the plan is loading). */
export function isLocked(p: PlanInfo | null): boolean {
  return Boolean(p?.enforced && !p.premium);
}

/** Free AI logs left today, or null when they're unlimited (Premium, or no limits on this server). */
export function freeLeft(p: PlanInfo | null): number | null {
  return p && p.enforced && !p.premium ? Math.max(0, p.limit - p.used) : null;
}

export async function refreshPlan(): Promise<void> {
  try {
    plan = await fetchPlan();
    emit();
  } catch {
    // Offline or server busy: keep what we had; the server still enforces the limits.
  }
}

/** Counts a successful AI log right away, without waiting for the server. */
export function noteAiLog(): void {
  if (plan && plan.enforced && !plan.premium) {
    plan = { ...plan, used: plan.used + 1 };
    emit();
  }
}

/** Loads the plan when someone signs in and forgets it when they sign out. */
export function usePlanLoader(userId: string | null): void {
  useEffect(() => {
    plan = null;
    emit();
    if (userId) void refreshPlan();
  }, [userId]);
  // A new day brings new free logs: check again when the app comes back to the front.
  useEffect(() => {
    if (!userId) return;
    const onShow = () => document.visibilityState === "visible" && void refreshPlan();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [userId]);
}

export function openPaywall(reason: PaywallReason): void {
  paywall = reason;
  emit();
}

export function closePaywall(): void {
  paywall = null;
  emit();
}

export function usePaywall(): PaywallReason | null {
  return useSyncExternalStore(subscribe, () => paywall);
}

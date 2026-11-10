// Apple Health (iPhone app only): reads steps, active exercise calories and weigh-ins into the diary.
// The browser and the home-screen web app can't reach Apple Health, so everything here is a no-op there.

import { useEffect } from "react";
import type { AggregatedSample, HealthSample } from "@capgo/capacitor-health";
import { addDays, parseDateKey, toDateKey, todayKey } from "./dates.ts";
import { isNative } from "./native.ts";
import { actions, getState, onStateChange, type HealthDay } from "./store.ts";

/**
 * Off until HealthKit is turned on for the app ID at Apple (see docs/APPLE_HEALTH.md). To turn it on:
 * set this to true, remove `includePlugins` from capacitor.config.ts and add
 * `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;` back to both App build settings in the Xcode project.
 */
export const APPLE_HEALTH_ENABLED = false;

const READ = ["steps", "calories", "weight"] as const; // "calories" = active energy burned
const DAYS = 7; // steps and calories re-read each time (today's keep growing)
const WEIGHT_DAYS = 30;
const MIN_GAP = 5 * 60 * 1000; // between automatic syncs

const plugin = () => import("@capgo/capacitor-health").then((m) => m.Health);

/** True when this device can link Apple Health (the iPhone app). */
export async function healthAvailable(): Promise<boolean> {
  if (!isNative || !APPLE_HEALTH_ENABLED) return false;
  try {
    return (await (await plugin()).isAvailable()).available;
  } catch {
    return false;
  }
}

/** Shows Apple's permission sheet, then reads the last week. Apple never says which items were turned off. */
export async function connectHealth(): Promise<void> {
  const Health = await plugin();
  await Health.requestAuthorization({ read: [...READ] });
  actions.setHealthConnected(true);
  await syncHealth();
}

export function disconnectHealth(): void {
  actions.setHealthConnected(false);
}

/** Groups Health's results by local calendar day. Exported for tests. */
export function healthDays(steps: AggregatedSample[], kcal: AggregatedSample[], weights: HealthSample[]): Record<string, HealthDay> {
  const days: Record<string, HealthDay> = {};
  const day = (iso: string) => (days[toDateKey(new Date(iso))] ??= {});
  for (const s of steps) if (s.value > 0) day(s.startDate).steps = s.value;
  for (const s of kcal) if (s.value > 0) day(s.startDate).activeKcal = s.value;
  // Several weigh-ins on one day: keep the last one.
  const latest = new Map<string, HealthSample>();
  for (const w of weights) {
    if (w.unit !== "kilogram" || !(w.value > 0)) continue;
    const key = toDateKey(new Date(w.endDate));
    const seen = latest.get(key);
    if (!seen || seen.endDate < w.endDate) latest.set(key, w);
  }
  for (const [key, w] of latest) (days[key] ??= {}).weightKg = w.value;
  return days;
}

let running: Promise<void> | null = null;

/** Reads the last week from Apple Health into the diary. */
export function syncHealth(): Promise<void> {
  running ??= (async () => {
    const Health = await plugin();
    const today = todayKey();
    const startDate = parseDateKey(addDays(today, -(DAYS - 1))).toISOString();
    const endDate = parseDateKey(addDays(today, 1)).toISOString();
    const [steps, kcal, weights] = await Promise.all([
      Health.queryAggregated({ dataType: "steps", startDate, endDate, bucket: "day", aggregation: "sum" }).catch(() => ({ samples: [] })),
      Health.queryAggregated({ dataType: "calories", startDate, endDate, bucket: "day", aggregation: "sum" }).catch(() => ({ samples: [] })),
      Health.readSamples({ dataType: "weight", startDate: parseDateKey(addDays(today, -(WEIGHT_DAYS - 1))).toISOString(), endDate, limit: 200 }).catch(
        () => ({ samples: [] }),
      ),
    ]);
    actions.importHealth(healthDays(steps.samples, kcal.samples, weights.samples));
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Keeps Apple Health data fresh: on open and whenever the app comes back to the front. */
export function useHealthSync(): void {
  useEffect(() => {
    if (!isNative || !APPLE_HEALTH_ENABLED) return;
    const maybeSync = () => {
      const { health } = getState();
      if (document.visibilityState !== "visible" || !health.connected) return;
      if (health.lastSync && Date.now() - health.lastSync < MIN_GAP) return;
      void syncHealth().catch(() => {});
    };
    maybeSync();
    document.addEventListener("visibilitychange", maybeSync);
    // Just signed in to another account (the link stays, the data is read again).
    const stop = onStateChange(() => {
      const { health } = getState();
      if (health.connected && health.lastSync === null && !running) maybeSync();
    });
    return () => {
      document.removeEventListener("visibilitychange", maybeSync);
      stop();
    };
  }, []);
}

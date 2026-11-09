import { useSyncExternalStore } from "react";
import { DEFAULT_GOALS, type Goals, type Profile } from "../../shared/nutrition.ts";
import { isLang, type Lang } from "../../shared/languages.ts";
import { isThemePref, type ThemePref } from "./theme.ts";
import { DEFAULT_REMINDER_TIMES, type ReminderTimes } from "../../shared/reminders.ts";
import {
  EMPTY_SYNC,
  isUuid,
  markDayChanged,
  markEntriesChanged,
  markEntryDeleted,
  markSettingsChanged,
  uuid,
  type SyncMeta,
} from "./syncState.ts";
import type { LogEntry } from "./types.ts";

export interface AppState {
  entries: LogEntry[];
  goals: Goals;
  profile: Profile | null;
  water: Record<string, number>; // date -> glasses (250 ml)
  burned: Record<string, number>; // date -> kcal burned by exercise
  weights: Record<string, number>; // date -> body weight that day (kg)
  targetWeight: number | null; // goal weight (kg)
  name: string; // shown in the greeting
  recents: Omit<LogEntry, "id" | "date" | "meal" | "loggedAt" | "photo">[]; // most recent first, de-duplicated by name
  aiConsent: boolean; // agreed to send meal photos to the AI service
  dayUpdatedAt: Record<string, number>; // date -> when water/burned last changed (for sync)
  settingsUpdatedAt: number; // when name/goals/profile last changed (for sync); 0 = never
  sync: SyncMeta; // cloud backup bookkeeping (see syncState.ts)
  reminders: { enabled: boolean; times: ReminderTimes }; // meal reminders on this device
  language: "auto" | Lang; // app language; "auto" follows the device
  theme: ThemePref; // light/dark look; "system" follows the device
  communityPush: boolean; // this device gets Community notifications (reset on sign-out)
}

const STORAGE_KEY = "foodtrack:v1";
const MAX_RECENTS = 30;

export const INITIAL_STATE: AppState = {
  entries: [],
  goals: DEFAULT_GOALS,
  profile: null,
  water: {},
  burned: {},
  weights: {},
  targetWeight: null,
  name: "",
  recents: [],
  aiConsent: false,
  dayUpdatedAt: {},
  settingsUpdatedAt: 0,
  sync: EMPTY_SYNC,
  reminders: { enabled: false, times: DEFAULT_REMINDER_TIMES },
  language: "auto",
  theme: "system",
  communityPush: false,
};

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const loaded: AppState = {
      ...INITIAL_STATE,
      ...parsed,
      goals: { ...DEFAULT_GOALS, ...parsed.goals },
      sync: { ...EMPTY_SYNC, ...parsed.sync },
      language: isLang(parsed.language) ? parsed.language : "auto",
      theme: isThemePref(parsed.theme) ? parsed.theme : "system",
    };
    // Diaries saved before cloud backup existed have no settings timestamp; if the person had
    // customised anything, give it the oldest possible one so it's uploaded but never beats a real edit.
    const customised = loaded.name !== "" || loaded.profile !== null || JSON.stringify(loaded.goals) !== JSON.stringify(DEFAULT_GOALS);
    if (!parsed.settingsUpdatedAt && customised) loaded.settingsUpdatedAt = 1;
    return loaded;
  } catch {
    return INITIAL_STATE;
  }
}

let state: AppState = typeof localStorage === "undefined" ? INITIAL_STATE : load();
let saveFailed = false;
const listeners = new Set<() => void>();

function setState(next: AppState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveFailed = false;
  } catch {
    // Storage full or blocked. Keep working in memory, and let the UI warn that nothing is being saved.
    saveFailed = true;
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, () => state);
}

/** True when the last save to this device failed, so data will be lost when the page closes. */
export function useSaveFailed(): boolean {
  return useSyncExternalStore(subscribe, () => saveFailed);
}

/**
 * Asks the browser not to clear this site's storage when space runs low or the site
 * hasn't been opened for a while (Safari otherwise may after 7 days without a visit).
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Not supported: nothing to do.
  }
}

export function getState(): AppState {
  return state;
}

// ---- Pure reducers (exported for tests) ----------------------------------

export function withEntries(s: AppState, added: LogEntry[]): AppState {
  const recents = [...s.recents];
  for (const e of added) {
    const { id: _id, date: _date, meal: _meal, loggedAt: _at, photo: _photo, ...food } = e;
    const existing = recents.findIndex((r) => r.name.toLowerCase() === food.name.toLowerCase());
    if (existing >= 0) recents.splice(existing, 1);
    recents.unshift(food);
  }
  return { ...s, entries: [...s.entries, ...added], recents: recents.slice(0, MAX_RECENTS) };
}

export function entriesForDate(s: AppState, date: string): LogEntry[] {
  return s.entries.filter((e) => e.date === date).sort((a, b) => a.loggedAt - b.loggedAt);
}

// ---- Actions ---------------------------------------------------------------

/** Ids are UUIDs so entries can be stored in the cloud database as they are. */
export function newId(): string {
  return uuid();
}

export const actions = {
  addEntries(added: LogEntry[]) {
    const now = Date.now();
    const stamped = added.map((e) => ({ ...e, updatedAt: now }));
    setState(markEntriesChanged(withEntries(state, stamped), stamped.map((e) => e.id)));
  },
  updateEntry(id: string, patch: Partial<LogEntry>) {
    const now = Date.now();
    const entries = state.entries.map((e) => (e.id === id ? { ...e, ...patch, id, updatedAt: now } : e));
    setState(markEntriesChanged({ ...state, entries }, [id]));
  },
  removeEntry(id: string) {
    const entry = state.entries.find((e) => e.id === id);
    if (!entry) return;
    setState(markEntryDeleted({ ...state, entries: state.entries.filter((e) => e.id !== id) }, entry, Date.now()));
  },
  setGoals(goals: Goals) {
    setState(markSettingsChanged({ ...state, goals }, Date.now()));
  },
  setProfile(profile: Profile | null) {
    setState(markSettingsChanged({ ...state, profile }, Date.now()));
  },
  setLanguage(language: AppState["language"]) {
    setState({ ...state, language });
  },
  setTheme(theme: ThemePref) {
    setState({ ...state, theme });
  },
  setCommunityPush(communityPush: boolean) {
    setState({ ...state, communityPush });
  },
  setReminders(reminders: AppState["reminders"]) {
    setState({ ...state, reminders });
  },
  setAiConsent(aiConsent: boolean) {
    setState({ ...state, aiConsent });
  },
  setName(name: string) {
    setState(markSettingsChanged({ ...state, name }, Date.now()));
  },
  setBurned(date: string, kcal: number) {
    const burned = { ...state.burned, [date]: Math.max(0, Math.round(kcal) || 0) };
    setState(markDayChanged({ ...state, burned }, date, Date.now()));
  },
  setWater(date: string, glasses: number) {
    const water = { ...state.water, [date]: Math.max(0, glasses) };
    setState(markDayChanged({ ...state, water }, date, Date.now()));
  },
  /** Records (or with null, removes) the weight for a day. The latest weigh-in also updates the
   *  body details, so calorie goals suggested from them stay current. */
  setWeight(date: string, kg: number | null) {
    const now = Date.now();
    const weights = { ...state.weights };
    if (kg === null) delete weights[date];
    else weights[date] = Math.round(kg * 10) / 10;
    let next = markDayChanged({ ...state, weights }, date, now);
    const latest = latestWeight(weights);
    if (latest && next.profile && latest.date === date && next.profile.weightKg !== latest.kg) {
      next = markSettingsChanged({ ...next, profile: { ...next.profile, weightKg: latest.kg } }, now);
    }
    setState(next);
  },
  setTargetWeight(kg: number | null) {
    setState(markSettingsChanged({ ...state, targetWeight: kg === null ? null : Math.round(kg * 10) / 10 }, Date.now()));
  },
  /** Replaces the diary with a backup. When signed in, everything in it is queued for upload. */
  importData(data: Partial<AppState>) {
    const now = Date.now();
    const imported: AppState = {
      ...INITIAL_STATE,
      ...data,
      goals: { ...DEFAULT_GOALS, ...data.goals },
      aiConsent: state.aiConsent,
      language: state.language,
      theme: state.theme,
      communityPush: state.communityPush,
      sync: { ...state.sync, pendingEntries: [], pendingDeletes: [], pendingDays: [], pendingSettings: false },
    };
    // Keep ids, so re-importing a backup updates the same entries in the cloud instead of duplicating them.
    const entries = imported.entries.map((e) => ({ ...e, id: isUuid(e.id) ? e.id : newId(), updatedAt: now }));
    const dates = [...new Set([...Object.keys(imported.water), ...Object.keys(imported.burned), ...Object.keys(imported.weights ?? {})])];
    let next = markEntriesChanged({ ...imported, entries }, entries.map((e) => e.id));
    for (const d of dates) next = markDayChanged(next, d, now);
    setState(markSettingsChanged(next, now));
  },
  reset() {
    setState({ ...INITIAL_STATE, aiConsent: state.aiConsent });
  },
  /** Used by cloud sync to apply uploads and downloads. */
  replace(next: AppState) {
    setState(next);
  },
};

/** The most recent weigh-in, if any. */
export function latestWeight(weights: Record<string, number>): { date: string; kg: number } | null {
  const date = Object.keys(weights).sort().at(-1);
  return date ? { date, kg: weights[date] } : null;
}

/** Choices that belong to this device, not the diary: kept when someone signs in or out. */
export function devicePrefs(): Pick<AppState, "aiConsent" | "language" | "theme"> {
  return { aiConsent: state.aiConsent, language: state.language, theme: state.theme };
}

/** Runs `listener` whenever the state changes (used to trigger uploads). */
export function onStateChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

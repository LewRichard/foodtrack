import { useSyncExternalStore } from "react";
import { DEFAULT_GOALS, type Goals, type Profile } from "../../shared/nutrition.ts";
import type { LogEntry } from "./types.ts";

export interface AppState {
  entries: LogEntry[];
  goals: Goals;
  profile: Profile | null;
  water: Record<string, number>; // date -> glasses (250 ml)
  burned: Record<string, number>; // date -> kcal burned by exercise
  name: string; // shown in the greeting
  recents: Omit<LogEntry, "id" | "date" | "meal" | "loggedAt" | "photo">[]; // most recent first, de-duplicated by name
  aiConsent: boolean; // agreed to send meal photos to the AI service
}

const STORAGE_KEY = "foodtrack:v1";
const MAX_RECENTS = 30;

export const INITIAL_STATE: AppState = {
  entries: [],
  goals: DEFAULT_GOALS,
  profile: null,
  water: {},
  burned: {},
  name: "",
  recents: [],
  aiConsent: false,
};

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return { ...INITIAL_STATE, ...parsed, goals: { ...DEFAULT_GOALS, ...parsed.goals } };
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

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export const actions = {
  addEntries(added: LogEntry[]) {
    setState(withEntries(state, added));
  },
  updateEntry(id: string, patch: Partial<LogEntry>) {
    setState({ ...state, entries: state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  },
  removeEntry(id: string) {
    setState({ ...state, entries: state.entries.filter((e) => e.id !== id) });
  },
  setGoals(goals: Goals) {
    setState({ ...state, goals });
  },
  setProfile(profile: Profile | null) {
    setState({ ...state, profile });
  },
  setAiConsent(aiConsent: boolean) {
    setState({ ...state, aiConsent });
  },
  setName(name: string) {
    setState({ ...state, name });
  },
  setBurned(date: string, kcal: number) {
    setState({ ...state, burned: { ...state.burned, [date]: Math.max(0, Math.round(kcal) || 0) } });
  },
  setWater(date: string, glasses: number) {
    setState({ ...state, water: { ...state.water, [date]: Math.max(0, glasses) } });
  },
  importData(data: AppState) {
    setState({ ...INITIAL_STATE, ...data });
  },
  reset() {
    setState(INITIAL_STATE);
  },
};

// Pure functions that decide what to upload and how to merge what comes back from the cloud.
// Kept free of network and storage code so the sync rules can be tested directly.
//
// Rules:
//  - Every change gets an `updatedAt` time; when two devices change the same thing, the newer wins.
//  - Changes are queued as "pending" and uploaded later, so the app works offline.
//  - Deleted entries are uploaded as tombstones (deleted = true) so other devices remove them too.

import { DEFAULT_GOALS, type Goals, type Profile } from "../../shared/nutrition.ts";
import type { LogEntry, MealType } from "./types.ts";

export interface SyncMeta {
  userId: string | null; // the account this device's data belongs to; null = not signed in
  pendingEntries: string[]; // ids of entries added or edited since the last upload
  pendingDeletes: LogEntry[]; // deleted entries not yet uploaded (updatedAt = deletion time)
  pendingDays: string[]; // dates whose water/burned changed
  pendingSettings: boolean; // name, goals or profile changed
  cursors: { entries: string | null; days: string | null; settings: string | null }; // server sync times seen
  lastSyncedAt: number | null;
}

export const EMPTY_SYNC: SyncMeta = {
  userId: null,
  pendingEntries: [],
  pendingDeletes: [],
  pendingDays: [],
  pendingSettings: false,
  cursors: { entries: null, days: null, settings: null },
  lastSyncedAt: null,
};

/** The parts of the app state that sync touches. */
export interface SyncedState {
  entries: LogEntry[];
  goals: Goals;
  profile: Profile | null;
  name: string;
  water: Record<string, number>;
  burned: Record<string, number>;
  weights: Record<string, number>; // date -> body weight (kg)
  targetWeight: number | null; // goal weight (kg)
  dayUpdatedAt: Record<string, number>;
  settingsUpdatedAt: number;
  sync: SyncMeta;
}

// ---- Database row shapes (snake_case, as stored in Supabase) -----------------------------

export interface EntryRow {
  id: string;
  date: string;
  meal: MealType;
  name: string;
  portion: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  confidence: LogEntry["confidence"];
  source: LogEntry["source"];
  photo: string | null;
  logged_at: number;
  updated_at: number;
  deleted: boolean;
  synced_at?: string;
}

export interface DayRow {
  date: string;
  water: number;
  burned: number;
  weight?: number | null; // missing on databases set up before weights existed
  updated_at: number;
  synced_at?: string;
}

export interface SettingsRow {
  name: string;
  goals: Partial<Goals>;
  profile: Profile | null;
  target_weight?: number | null; // missing on databases set up before weights existed
  updated_at: number;
  synced_at?: string;
}

export interface PushBatch {
  entries: EntryRow[];
  days: DayRow[];
  settings: SettingsRow | null;
}

export interface Pulled {
  entries: EntryRow[];
  days: DayRow[];
  settings: SettingsRow[];
}

// ---- Helpers --------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID.test(id);
}

/** Random v4 UUID. Works on plain http:// too, where crypto.randomUUID isn't available. */
export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function entryVersion(e: LogEntry): number {
  return e.updatedAt ?? e.loggedAt;
}

const add = (list: string[], item: string) => (list.includes(item) ? list : [...list, item]);
const later = (a: string | null, b: string | undefined) => (b && (!a || b > a) ? b : a);

export function toEntryRow(e: LogEntry, deleted = false): EntryRow {
  return {
    id: e.id,
    date: e.date,
    meal: e.meal,
    name: e.name.slice(0, 200),
    portion: (e.portion ?? "").slice(0, 200),
    grams: e.grams || 0,
    calories: e.calories || 0,
    protein: e.protein || 0,
    carbs: e.carbs || 0,
    fat: e.fat || 0,
    fiber: e.fiber || 0,
    sugar: e.sugar || 0,
    sodium: e.sodium || 0,
    confidence: e.confidence,
    source: e.source,
    photo: e.photo ?? null,
    logged_at: e.loggedAt,
    updated_at: entryVersion(e),
    deleted,
  };
}

export function fromEntryRow(r: EntryRow): LogEntry {
  return {
    id: r.id,
    date: r.date,
    meal: r.meal,
    name: r.name,
    portion: r.portion,
    grams: Number(r.grams),
    calories: Number(r.calories),
    protein: Number(r.protein),
    carbs: Number(r.carbs),
    fat: Number(r.fat),
    fiber: Number(r.fiber),
    sugar: Number(r.sugar),
    sodium: Number(r.sodium),
    confidence: r.confidence,
    source: r.source,
    photo: r.photo ?? undefined,
    loggedAt: Number(r.logged_at),
    updatedAt: Number(r.updated_at),
  };
}

// ---- Recording local changes ----------------------------------------------------------------

export function markEntriesChanged<S extends SyncedState>(s: S, ids: string[]): S {
  return { ...s, sync: { ...s.sync, pendingEntries: ids.reduce(add, s.sync.pendingEntries) } };
}

export function markEntryDeleted<S extends SyncedState>(s: S, entry: LogEntry, at: number): S {
  return {
    ...s,
    sync: {
      ...s.sync,
      pendingEntries: s.sync.pendingEntries.filter((id) => id !== entry.id),
      pendingDeletes: [...s.sync.pendingDeletes.filter((e) => e.id !== entry.id), { ...entry, updatedAt: at }],
    },
  };
}

export function markDayChanged<S extends SyncedState>(s: S, date: string, at: number): S {
  return {
    ...s,
    dayUpdatedAt: { ...s.dayUpdatedAt, [date]: at },
    sync: { ...s.sync, pendingDays: add(s.sync.pendingDays, date) },
  };
}

export function markSettingsChanged<S extends SyncedState>(s: S, at: number): S {
  return { ...s, settingsUpdatedAt: at, sync: { ...s.sync, pendingSettings: true } };
}

// ---- Upload -----------------------------------------------------------------------------------

export function collectPush(s: SyncedState): PushBatch {
  const pending = new Set(s.sync.pendingEntries);
  const entries = [
    ...s.entries.filter((e) => pending.has(e.id)).map((e) => toEntryRow(e)),
    ...s.sync.pendingDeletes.map((e) => toEntryRow(e, true)),
  ];
  const days = s.sync.pendingDays.map((date) => ({
    date,
    water: s.water[date] ?? 0,
    burned: s.burned[date] ?? 0,
    weight: s.weights?.[date] ?? null,
    updated_at: s.dayUpdatedAt[date] ?? 1,
  }));
  const settings = s.sync.pendingSettings
    ? { name: s.name, goals: s.goals, profile: s.profile, target_weight: s.targetWeight ?? null, updated_at: s.settingsUpdatedAt || 1 }
    : null;
  return { entries, days, settings };
}

export function isEmptyPush(b: PushBatch): boolean {
  return b.entries.length === 0 && b.days.length === 0 && !b.settings;
}

export function hasPending(s: SyncedState): boolean {
  return isEmptyPush(collectPush(s)) === false;
}

/** Clears what was uploaded, except anything changed again while the upload was in flight. */
export function afterPush<S extends SyncedState>(s: S, batch: PushBatch): S {
  const pushed = new Map(batch.entries.map((r) => [r.id, r]));
  const pushedDays = new Map(batch.days.map((d) => [d.date, d.updated_at]));
  const current = new Map(s.entries.map((e) => [e.id, e]));
  return {
    ...s,
    sync: {
      ...s.sync,
      pendingEntries: s.sync.pendingEntries.filter((id) => {
        const row = pushed.get(id);
        const e = current.get(id);
        return !(row && !row.deleted && e && entryVersion(e) === row.updated_at);
      }),
      pendingDeletes: s.sync.pendingDeletes.filter((e) => {
        const row = pushed.get(e.id);
        return !(row && row.deleted && row.updated_at === entryVersion(e));
      }),
      pendingDays: s.sync.pendingDays.filter((date) => pushedDays.get(date) !== (s.dayUpdatedAt[date] ?? 1)),
      pendingSettings: s.sync.pendingSettings && !(batch.settings && batch.settings.updated_at === (s.settingsUpdatedAt || 1)),
    },
  };
}

// ---- Download ---------------------------------------------------------------------------------

/** Merges rows from the cloud into local state: for each item, the newer version wins. */
export function mergeRemote<S extends SyncedState>(s: S, pulled: Pulled): S {
  const entries = new Map(s.entries.map((e) => [e.id, e]));
  const tombstones = new Map(s.sync.pendingDeletes.map((e) => [e.id, entryVersion(e)]));
  let pendingEntries = s.sync.pendingEntries;
  let pendingDeletes = s.sync.pendingDeletes;
  let cursors = s.sync.cursors;

  for (const row of pulled.entries) {
    cursors = { ...cursors, entries: later(cursors.entries, row.synced_at) };
    const remoteVersion = Number(row.updated_at);
    const deletedHere = tombstones.get(row.id);
    if (deletedHere !== undefined && deletedHere >= remoteVersion) continue; // our deletion is newer
    const local = entries.get(row.id);
    if (local && entryVersion(local) >= remoteVersion) continue; // our copy is newer or the same
    if (row.deleted) {
      entries.delete(row.id);
    } else {
      entries.set(row.id, fromEntryRow(row));
    }
    // The cloud's version replaced ours, so ours no longer needs uploading.
    pendingEntries = pendingEntries.filter((id) => id !== row.id);
    pendingDeletes = pendingDeletes.filter((e) => e.id !== row.id);
  }

  const water = { ...s.water };
  const burned = { ...s.burned };
  const weights = { ...(s.weights ?? {}) };
  const dayUpdatedAt = { ...s.dayUpdatedAt };
  let pendingDays = s.sync.pendingDays;
  for (const row of pulled.days) {
    cursors = { ...cursors, days: later(cursors.days, row.synced_at) };
    if ((dayUpdatedAt[row.date] ?? 0) >= Number(row.updated_at)) continue;
    water[row.date] = row.water;
    burned[row.date] = row.burned;
    if (row.weight !== undefined) {
      if (row.weight === null) delete weights[row.date];
      else weights[row.date] = Number(row.weight);
    }
    dayUpdatedAt[row.date] = Number(row.updated_at);
    pendingDays = pendingDays.filter((d) => d !== row.date);
  }

  let { name, goals, profile, settingsUpdatedAt } = s;
  let targetWeight = s.targetWeight ?? null;
  let pendingSettings = s.sync.pendingSettings;
  for (const row of pulled.settings) {
    cursors = { ...cursors, settings: later(cursors.settings, row.synced_at) };
    if (settingsUpdatedAt >= Number(row.updated_at)) continue;
    name = row.name ?? "";
    goals = { ...DEFAULT_GOALS, ...row.goals };
    profile = row.profile ?? null;
    if (row.target_weight !== undefined) targetWeight = row.target_weight === null ? null : Number(row.target_weight);
    settingsUpdatedAt = Number(row.updated_at);
    pendingSettings = false;
  }

  return {
    ...s,
    entries: [...entries.values()],
    water,
    burned,
    weights,
    dayUpdatedAt,
    name,
    goals,
    profile,
    targetWeight,
    settingsUpdatedAt,
    sync: { ...s.sync, pendingEntries, pendingDeletes, pendingDays, pendingSettings, cursors },
  };
}

// ---- Signing in and out -------------------------------------------------------------------------

/**
 * Called when a user signs in on this device.
 *  - Same account as before: nothing changes.
 *  - Data from before any sign-in: it's kept and queued for upload, so it joins the account.
 *  - A different account's data: it's dropped from this device (it's safe in that account).
 */
export function attachAccount<S extends SyncedState>(s: S, userId: string, blank: S): S {
  if (s.sync.userId === userId) return s;
  if (s.sync.userId !== null) return { ...blank, sync: { ...EMPTY_SYNC, userId } };

  // Database ids must be UUIDs; older entries may have used a different format.
  const entries = s.entries.map((e) => (isUuid(e.id) ? e : { ...e, id: uuid() }));
  const dates = [...new Set([...Object.keys(s.water), ...Object.keys(s.burned), ...Object.keys(s.weights ?? {})])];
  const dayUpdatedAt = { ...s.dayUpdatedAt };
  for (const d of dates) dayUpdatedAt[d] ??= 1;
  return {
    ...s,
    entries,
    dayUpdatedAt,
    sync: {
      ...EMPTY_SYNC,
      userId,
      pendingEntries: entries.map((e) => e.id),
      pendingDays: dates,
      // Untouched default goals shouldn't overwrite settings already saved in the account.
      pendingSettings: s.settingsUpdatedAt > 0,
    },
  };
}

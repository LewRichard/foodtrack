// Accounts and cloud backup with Supabase. Everything here is optional: when the Supabase
// settings aren't present at build time, the app runs exactly as before (device-only).

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { actions, devicePrefs, getState, INITIAL_STATE, onStateChange, type AppState } from "./store.ts";
import { projectUrl, supabaseKey } from "../../shared/supabase.ts";
import { t } from "../i18n/index.ts";
import { isNative } from "./native.ts";
import { setSyncStatus, syncOnce, type Remote } from "./sync.ts";
import { attachAccount, hasPending, type DayRow, type EntryRow, type Pulled, type SettingsRow } from "./syncState.ts";

const url = projectUrl(import.meta.env.VITE_SUPABASE_URL ?? "");
const key = supabaseKey(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "");

/** True when this build has Supabase settings, so accounts and backup are available. */
export const cloudEnabled = Boolean(url && key);

// The Supabase library is loaded separately so the app starts just as fast without an account.
let supabase: SupabaseClient | null = null;
const ready: Promise<SupabaseClient> | null = cloudEnabled
  ? import("@supabase/supabase-js").then(({ createClient }) => {
      supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
      return supabase;
    })
  : null;

async function client(): Promise<SupabaseClient> {
  if (!ready) throw new Error(t("cloud.notSetUp"));
  return ready;
}

// ---- Session ------------------------------------------------------------------------------------

let session: Session | null = null;
const sessionListeners = new Set<() => void>();

function setSession(next: Session | null) {
  session = next;
  sessionListeners.forEach((l) => l());
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (l) => {
      sessionListeners.add(l);
      return () => sessionListeners.delete(l);
    },
    () => session,
  );
}

// ---- Database access ----------------------------------------------------------------------------

const PAGE = 1000; // Supabase returns at most 1000 rows per request
const OVERLAP_MS = 5000; // re-read a few seconds back so rows committed slightly out of order aren't missed

async function pullTable<T>(table: string, cursor: string | null): Promise<T[]> {
  const db = supabase!;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = db.from(table).select("*").order("synced_at", { ascending: true }).range(from, from + PAGE - 1);
    if (cursor) query = query.gt("synced_at", new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString());
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

function supabaseRemote(userId: string): Remote {
  const db = supabase!;
  return {
    async push(batch) {
      if (batch.entries.length) {
        const rows = batch.entries.map((r) => ({ ...r, user_id: userId }));
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await db.from("food_entries").upsert(rows.slice(i, i + 500), { onConflict: "id" });
          if (error) throw error;
        }
      }
      if (batch.days.length) {
        const rows = batch.days.map((d) => ({ ...d, user_id: userId }));
        const { error } = await db.from("day_logs").upsert(rows, { onConflict: "user_id,date" });
        if (error) throw error;
      }
      if (batch.settings) {
        const { error } = await db.from("user_settings").upsert({ ...batch.settings, user_id: userId }, { onConflict: "user_id" });
        if (error) throw error;
      }
    },
    async pull(cursors): Promise<Pulled> {
      const [entries, days, settings] = await Promise.all([
        pullTable<EntryRow>("food_entries", cursors.entries),
        pullTable<DayRow>("day_logs", cursors.days),
        pullTable<SettingsRow>("user_settings", cursors.settings),
      ]);
      return { entries, days, settings };
    },
  };
}

// ---- Syncing ------------------------------------------------------------------------------------

let running: Promise<void> | null = null;
let again = false;

/** Uploads pending changes and downloads new ones. Safe to call often; calls are combined. */
export function syncNow(): Promise<void> {
  if (!supabase || !session) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  const userId = session.user.id;
  running = (async () => {
    do {
      again = false;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setSyncStatus({ kind: "offline" });
        return;
      }
      setSyncStatus({ kind: "syncing" });
      try {
        await syncOnce<AppState>(supabaseRemote(userId), getState, actions.replace);
        setSyncStatus({ kind: "idle" });
      } catch (e) {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        setSyncStatus(offline ? { kind: "offline" } : { kind: "error", message: describeError(e) });
        return;
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

function describeError(e: unknown): string {
  const message = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
  if (/relation .* does not exist|schema cache/i.test(message)) {
    return t("sync.notSetUp");
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return t("sync.unreachable");
  return message;
}

let debounce: ReturnType<typeof setTimeout> | undefined;

/** Starts listening for sign-in changes and keeps the diary synced. Call once at startup. */
export async function startCloud() {
  if (!ready) return;
  const db = await ready;

  db.auth.onAuthStateChange((event, next) => {
    setSession(next);
    if (next && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) {
      actions.replace(attachAccount(getState(), next.user.id, { ...INITIAL_STATE, ...devicePrefs() }));
      // Run outside the auth callback (Supabase recommends not awaiting calls inside it).
      setTimeout(() => void syncNow(), 0);
    }
  });

  // Upload shortly after each change (grouping quick edits together).
  onStateChange(() => {
    if (!session || !hasPending(getState())) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => void syncNow(), 1500);
  });

  // Catch up when the app comes back to the foreground or the connection returns.
  window.addEventListener("online", () => void syncNow());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === "visible") void syncNow();
  }, 2 * 60 * 1000);
}

/** The Supabase client (for features like reminders that store their own rows). */
export function cloudClient(): Promise<SupabaseClient> {
  return client();
}

const beforeSignOut: Array<() => Promise<void>> = [];

// Web reminders belong to the account and stop on sign-out; the iPhone app's are on the phone itself.
function keptReminders(): AppState["reminders"] {
  const r = getState().reminders;
  return isNative ? r : { ...r, enabled: false };
}

/** Runs `fn` before signing out or deleting the account (e.g. to stop this device's notifications). */
export function onBeforeSignOut(fn: () => Promise<void>) {
  beforeSignOut.push(fn);
}

const beforeDelete: Array<() => Promise<void>> = [];

/** Runs `fn` before the account is deleted (e.g. to remove files the database can't delete itself). */
export function onBeforeDeleteAccount(fn: () => Promise<void>) {
  beforeDelete.push(fn);
}

async function runBeforeSignOut() {
  for (const fn of beforeSignOut) await fn().catch(() => {});
}

/** The signed-in user's access token (refreshed if needed), sent to our server to prove sign-in. */
export async function accessToken(): Promise<string | null> {
  if (!ready || !session) return null;
  const { data } = await (await ready).auth.getSession();
  return data.session?.access_token ?? null;
}

// ---- Account actions ----------------------------------------------------------------------------

export interface AuthResult {
  needsConfirmation?: boolean;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await (await client()).auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendlyAuthError(error.message));
  return {};
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await (await client()).auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(friendlyAuthError(error.message));
  // With "Confirm email" switched on in Supabase, there's no session until the link is clicked.
  return { needsConfirmation: !data.session };
}

/** Signs out and clears this device. Returns false (without signing out) if changes would be lost and `force` isn't set. */
export async function signOut(force = false): Promise<boolean> {
  await syncNow().catch(() => {});
  if (!force && hasPending(getState())) return false;
  await runBeforeSignOut();
  await (await client()).auth.signOut();
  actions.replace({ ...INITIAL_STATE, ...devicePrefs(), reminders: keptReminders() });
  setSyncStatus({ kind: "idle" });
  return true;
}

/** Permanently deletes the account and everything stored in it, then clears this device. */
export async function deleteAccount(): Promise<void> {
  const db = await client();
  for (const fn of beforeDelete) await fn().catch(() => {});
  await runBeforeSignOut();
  const { error } = await db.rpc("delete_my_account");
  if (error) throw new Error(describeError(error));
  await db.auth.signOut().catch(() => {});
  actions.replace({ ...INITIAL_STATE, ...devicePrefs(), reminders: keptReminders() });
  setSyncStatus({ kind: "idle" });
}

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return t("auth.wrongPassword");
  if (/email not confirmed/i.test(message)) return t("auth.confirmFirst");
  if (/already registered|already exists/i.test(message)) return t("auth.exists");
  if (/password should be at least/i.test(message)) return t("auth.shortPassword");
  if (/rate limit/i.test(message)) return t("auth.rateLimit");
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return t("err.network");
  return message;
}

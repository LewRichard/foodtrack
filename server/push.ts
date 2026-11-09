// Sends meal reminders as web push notifications.
//
// A scheduled job (pg_cron in Supabase, see supabase/reminders-cron.sql) calls POST /api/cron/reminders
// every ~10 minutes. For each person with reminders on, we work out which are due in their time zone,
// skip any meal they've already logged today, and push to each of their devices.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendNotification, setVapidDetails } from "web-push";
import { dueReminders, reminderText, type ReminderSlot } from "../shared/reminders.ts";
import { projectUrl, supabaseKey } from "../shared/supabase.ts";

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface ReminderRow {
  user_id: string;
  timezone: string;
  breakfast: string | null;
  lunch: string | null;
  dinner: string | null;
  last_sent: Partial<Record<ReminderSlot, string>> | null;
  language?: string | null; // added later; older databases may not have it
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Everything the reminder run needs from the outside world (Supabase + web push), so it can be tested. */
export interface ReminderDeps {
  listReminders(): Promise<ReminderRow[]>;
  hasLoggedMeal(userId: string, date: string, meal: ReminderSlot): Promise<boolean>;
  subscriptionsFor(userId: string): Promise<PushSubscriptionRow[]>;
  markSent(userId: string, lastSent: Partial<Record<ReminderSlot, string>>): Promise<void>;
  deleteSubscription(endpoint: string): Promise<void>;
  send(sub: PushSubscriptionRow, message: PushMessage): Promise<void>;
}

export interface ReminderRunResult {
  people: number;
  sent: number;
  alreadyLogged: number;
  removedDevices: number;
  failed: number;
}

/** A push service says this subscription no longer exists (app uninstalled, permission revoked…). */
function isGone(e: unknown): boolean {
  const status = (e as { statusCode?: number })?.statusCode;
  return status === 404 || status === 410;
}

export async function runReminders(deps: ReminderDeps, now = new Date()): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { people: 0, sent: 0, alreadyLogged: 0, removedDevices: 0, failed: 0 };
  for (const row of await deps.listReminders()) {
    const lastSent = row.last_sent ?? {};
    const { date, slots } = dueReminders(row, row.timezone, lastSent, now);
    if (slots.length === 0) continue;
    result.people++;

    // Only the latest due meal is worth a notification (e.g. after downtime, don't send three at once).
    const slot = slots[slots.length - 1];
    const handled = { ...lastSent };
    for (const s of slots) handled[s] = date;

    if (await deps.hasLoggedMeal(row.user_id, date, slot)) {
      result.alreadyLogged++;
    } else {
      const text = reminderText(row.language, slot);
      const message = { ...text, url: `/?tab=scan&meal=${slot}`, tag: `meal-${slot}` };
      for (const sub of await deps.subscriptionsFor(row.user_id)) {
        try {
          await deps.send(sub, message);
          result.sent++;
        } catch (e) {
          if (isGone(e)) {
            await deps.deleteSubscription(sub.endpoint);
            result.removedDevices++;
          } else {
            result.failed++;
          }
        }
      }
    }
    await deps.markSent(row.user_id, handled);
  }
  return result;
}

// ---- Real implementations -------------------------------------------------------------------------

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
  cronSecret: string;
  db: SupabaseClient | null;
}

/** Reads push settings from the environment. Reminders are off unless all of them are present. */
export function pushConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PushConfig | null {
  const publicKey = (env.VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = (env.VAPID_SUBJECT ?? "").trim();
  const cronSecret = (env.CRON_SECRET ?? "").trim();
  const url = projectUrl(env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? "");
  const serviceKey = supabaseKey(env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  if (!publicKey || !privateKey || !url || !serviceKey) return null;
  try {
    setVapidDetails(subject.startsWith("mailto:") || subject.startsWith("https://") ? subject : `mailto:${subject || "noreply@example.com"}`, publicKey, privateKey);
  } catch (e) {
    // A key pasted incompletely shouldn't take the whole app down: run without reminders and say why.
    console.error(
      `Meal reminders are off: the VAPID keys aren't valid (${e instanceof Error ? e.message : e}). ` +
        "Generate new ones with `npx web-push generate-vapid-keys` and paste both in full.",
    );
    return null;
  }
  return {
    publicKey,
    privateKey,
    subject,
    cronSecret,
    db: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

export async function sendPush(sub: PushSubscriptionRow, message: PushMessage): Promise<void> {
  await sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(message), {
    TTL: 60 * 60, // drop it if the phone is unreachable for an hour; a late meal reminder isn't useful
    urgency: "normal",
  });
}

/** Supabase-backed deps. Uses the service role key, which bypasses row security: server only. */
export function supabaseReminderDeps(db: SupabaseClient): ReminderDeps {
  const check = <T>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
    if (error) throw new Error(error.message);
    return data as T;
  };
  return {
    async listReminders() {
      return check(
        // "*" rather than a column list, so a database set up before `language` existed keeps working.
        await db.from("reminder_settings").select("*").eq("enabled", true),
      ) as ReminderRow[];
    },
    async hasLoggedMeal(userId, date, meal) {
      const rows = check(
        await db.from("food_entries").select("id").eq("user_id", userId).eq("date", date).eq("meal", meal).eq("deleted", false).limit(1),
      ) as unknown[];
      return rows.length > 0;
    },
    async subscriptionsFor(userId) {
      return check(await db.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId)) as PushSubscriptionRow[];
    },
    async markSent(userId, lastSent) {
      check(await db.from("reminder_settings").update({ last_sent: lastSent }).eq("user_id", userId));
    },
    async deleteSubscription(endpoint) {
      check(await db.from("push_subscriptions").delete().eq("endpoint", endpoint));
    },
    send: sendPush,
  };
}


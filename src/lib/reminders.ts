// Meal reminders on this device.
//  - Website / home-screen app: web push. The device subscribes with the browser's push service and
//    the server sends reminders at the chosen times, skipping meals already logged (needs sign-in).
//  - iPhone app (Capacitor): local notifications scheduled on the phone itself, no server needed.

import { REMINDER_SLOTS, parseTime, reminderText, testReminderText, type ReminderTimes } from "../../shared/reminders.ts";
import { currentLanguage, t } from "../i18n/index.ts";
import { API_BASE } from "./api.ts";
import { accessToken, cloudClient, onBeforeSignOut } from "./cloud.ts";
import { isNative } from "./native.ts";
import { actions, getState } from "./store.ts";

export type ReminderSupport =
  | { kind: "native" }
  | { kind: "web" }
  | { kind: "ios-needs-home-screen" } // iPhone Safari: web push only works from a home-screen app
  | { kind: "unsupported" };

export function reminderSupport(): ReminderSupport {
  if (isNative) return { kind: "native" };
  const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return { kind: "ios-needs-home-screen" };
  return hasPush ? { kind: "web" } : { kind: "unsupported" };
}

/** Whether this server has reminders set up (push keys + database access). */
export async function serverPushKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/push/config`);
    const body = (await res.json()) as { enabled?: boolean; publicKey?: string };
    return body.enabled && body.publicKey ? body.publicKey : null;
  } catch {
    return null;
  }
}

function base64UrlToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

async function serviceWorker(): Promise<ServiceWorkerRegistration> {
  // The app registers the worker on load in production; make sure it exists in any case.
  if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

async function saveSettings(times: ReminderTimes, enabled: boolean) {
  const db = await cloudClient();
  const { data } = await db.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error(t("rem.signInFirst"));
  const row = {
    user_id: userId,
    enabled,
    timezone: timeZone(),
    language: currentLanguage(),
    breakfast: times.breakfast,
    lunch: times.lunch,
    dinner: times.dinner,
    updated_at: new Date().toISOString(),
  };
  let { error } = await db.from("reminder_settings").upsert(row, { onConflict: "user_id" });
  // Databases set up before languages existed have no language column: save without it
  // (reminders then arrive in English) rather than failing.
  if (error && /language/.test(error.message)) {
    const { language: _language, ...withoutLanguage } = row;
    ({ error } = await db.from("reminder_settings").upsert(withoutLanguage, { onConflict: "user_id" }));
  }
  if (error) throw new Error(friendly(error.message));
}

function friendly(message: string): string {
  if (/relation .* does not exist|schema cache|function .* does not exist/i.test(message)) {
    return t("rem.tablesMissing");
  }
  return message;
}

// ---- Web push -------------------------------------------------------------------------------------

/** Registers this browser for push notifications (meal reminders and Community share it). */
export async function subscribeThisDevice(): Promise<void> {
  const publicKey = await serverPushKey();
  if (!publicKey) throw new Error(t("rem.serverOff"));
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(t("rem.blocked"));
  }
  const reg = await serviceWorker();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
  const json = sub.toJSON();
  const db = await cloudClient();
  const { error } = await db.rpc("save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(friendly(error.message));
}

async function enableWeb(times: ReminderTimes) {
  await subscribeThisDevice();
  await saveSettings(times, true);
}

/** Stops all notifications on this device (other devices keep theirs). */
export async function unsubscribeThisDevice() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const db = await cloudClient().catch(() => null);
  await db?.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe().catch(() => {});
}

// ---- iPhone app (local notifications) -------------------------------------------------------------

const NATIVE_IDS = { breakfast: 101, lunch: 102, dinner: 103 } as const;

async function scheduleNative(times: ReminderTimes | null) {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.cancel({ notifications: Object.values(NATIVE_IDS).map((id) => ({ id })) });
  if (!times) return;
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") {
    throw new Error(t("rem.nativeBlocked"));
  }
  const notifications = REMINDER_SLOTS.flatMap((slot) => {
    const at = parseTime(times[slot]);
    if (at === null) return [];
    const text = reminderText(currentLanguage(), slot);
    return [
      {
        id: NATIVE_IDS[slot],
        title: text.title,
        body: text.body,
        schedule: { on: { hour: Math.floor(at / 60), minute: at % 60 }, allowWhileIdle: true },
        extra: { tab: "scan", meal: slot },
      },
    ];
  });
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

// ---- Public API -----------------------------------------------------------------------------------

/** Turns reminders on (asking for notification permission) or saves new times. */
export async function enableReminders(times: ReminderTimes): Promise<void> {
  if (isNative) await scheduleNative(times);
  else await enableWeb(times);
  actions.setReminders({ enabled: true, times });
}

export async function disableReminders(): Promise<void> {
  const { times } = getState().reminders;
  if (isNative) {
    await scheduleNative(null);
  } else {
    // The device stays registered if Community notifications still use it.
    if (!getState().communityPush) await unsubscribeThisDevice();
    await saveSettings(times, false).catch(() => {});
  }
  actions.setReminders({ enabled: false, times });
}

/** Asks the server to send a sample notification to this account's devices. */
export async function sendTestReminder(): Promise<number> {
  if (isNative) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [{ id: 199, ...testReminderText(currentLanguage()), schedule: { at: new Date(Date.now() + 3000) } }],
    });
    return 1;
  }
  const token = await accessToken();
  const res = await fetch(`${API_BASE}/api/push/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ language: currentLanguage() }),
  });
  const body = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
  if (!res.ok) throw new Error(body.error ?? t("common.requestFailed", { status: res.status }));
  return body.sent ?? 0;
}

/** Call once at startup: wires notification taps to open the scan screen. */
export function startReminders() {
  if (isNative) {
    void import("@capacitor/local-notifications").then(({ LocalNotifications }) =>
      LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
        const tab = (event.notification.extra as { tab?: string } | undefined)?.tab;
        if (tab) window.dispatchEvent(new CustomEvent("foodtrack:navigate", { detail: tab }));
      }),
    );
  } else {
    // Signing out (or deleting the account) stops this device's notifications for that account.
    onBeforeSignOut(unsubscribeThisDevice);
  }
}

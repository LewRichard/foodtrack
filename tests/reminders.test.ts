import { describe, expect, it } from "vitest";
import { DEFAULT_REMINDER_TIMES, dueReminders, localClock, parseTime } from "../shared/reminders.ts";
import { runReminders, type PushMessage, type ReminderDeps, type ReminderRow } from "../server/push.ts";

// 01:05 UTC = 08:05 in Vietnam (UTC+7)
const at = (iso: string) => new Date(iso);

describe("reminder timing", () => {
  it("reads times, including Postgres's HH:MM:SS", () => {
    expect(parseTime("08:00")).toBe(480);
    expect(parseTime("12:30:00")).toBe(750);
    expect(parseTime(null)).toBeNull();
    expect(parseTime("25:00")).toBeNull();
  });

  it("uses the person's own time zone and date", () => {
    expect(localClock(at("2026-11-09T01:05:00Z"), "Asia/Ho_Chi_Minh")).toEqual({ date: "2026-11-09", minutes: 8 * 60 + 5 });
    expect(localClock(at("2026-11-09T20:00:00Z"), "Asia/Ho_Chi_Minh")).toEqual({ date: "2026-11-10", minutes: 3 * 60 });
    expect(localClock(at("2026-11-09T01:05:00Z"), "Not/AZone")).toEqual({ date: "2026-11-09", minutes: 65 });
  });

  it("is due from its time until the window closes, once per day", () => {
    const tz = "Asia/Ho_Chi_Minh";
    const t = DEFAULT_REMINDER_TIMES; // 08:00, 12:30, 19:00
    expect(dueReminders(t, tz, {}, at("2026-11-09T00:55:00Z")).slots).toEqual([]); // 07:55
    expect(dueReminders(t, tz, {}, at("2026-11-09T01:05:00Z")).slots).toEqual(["breakfast"]); // 08:05
    expect(dueReminders(t, tz, {}, at("2026-11-09T01:50:00Z")).slots).toEqual([]); // 08:50, window over
    expect(dueReminders(t, tz, { breakfast: "2026-11-09" }, at("2026-11-09T01:15:00Z")).slots).toEqual([]); // already sent
    expect(dueReminders(t, tz, { breakfast: "2026-11-08" }, at("2026-11-09T01:15:00Z")).slots).toEqual(["breakfast"]); // yesterday's
    expect(dueReminders({ ...t, lunch: null }, tz, {}, at("2026-11-09T05:35:00Z")).slots).toEqual([]); // lunch off
  });
});

/** In-memory stand-in for Supabase + the push service. */
function fakeDeps(rows: ReminderRow[], opts: { logged?: string[]; devices?: Record<string, string[]>; gone?: string[] } = {}) {
  const sent: { endpoint: string; message: PushMessage }[] = [];
  const marked: Record<string, unknown> = {};
  const deleted: string[] = [];
  const devices = opts.devices ?? Object.fromEntries(rows.map((r) => [r.user_id, [`https://push/${r.user_id}`]]));
  const deps: ReminderDeps = {
    listReminders: async () => rows,
    hasLoggedMeal: async (u, d, m) => (opts.logged ?? []).includes(`${u}|${d}|${m}`),
    subscriptionsFor: async (u) => (devices[u] ?? []).map((endpoint) => ({ endpoint, p256dh: "k", auth: "a" })),
    markSent: async (u, last) => {
      marked[u] = last;
    },
    deleteSubscription: async (e) => {
      deleted.push(e);
    },
    send: async (sub, message) => {
      if ((opts.gone ?? []).includes(sub.endpoint)) throw Object.assign(new Error("gone"), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, message });
    },
  };
  return { deps, sent, marked, deleted };
}

const row = (user_id: string, extra: Partial<ReminderRow> = {}): ReminderRow => ({
  user_id,
  timezone: "Asia/Ho_Chi_Minh",
  breakfast: "08:00:00",
  lunch: "12:30:00",
  dinner: "19:00:00",
  last_sent: {},
  ...extra,
});

describe("reminder run", () => {
  const breakfastTime = at("2026-11-09T01:05:00Z"); // 08:05 in Vietnam

  it("reminds people who haven't logged the meal, on every device, and only once", async () => {
    const f = fakeDeps([row("lew"), row("an")], { devices: { lew: ["https://push/phone", "https://push/laptop"], an: ["https://push/an"] } });
    const result = await runReminders(f.deps, breakfastTime);
    expect(result).toMatchObject({ people: 2, sent: 3, alreadyLogged: 0 });
    expect(f.sent[0].message).toMatchObject({ title: "🍳 Breakfast time", url: "/?tab=scan&meal=breakfast" });
    expect(f.marked.lew).toEqual({ breakfast: "2026-11-09" });

    // Next run 10 minutes later: already handled today, nothing more is sent.
    const again = fakeDeps([row("lew", { last_sent: { breakfast: "2026-11-09" } })]);
    expect(await runReminders(again.deps, at("2026-11-09T01:15:00Z"))).toMatchObject({ people: 0, sent: 0 });
  });

  it("stays quiet if the meal is already logged", async () => {
    const f = fakeDeps([row("lew")], { logged: ["lew|2026-11-09|breakfast"] });
    expect(await runReminders(f.deps, breakfastTime)).toMatchObject({ sent: 0, alreadyLogged: 1 });
    expect(f.marked.lew).toEqual({ breakfast: "2026-11-09" }); // and doesn't check again today
  });

  it("forgets devices the push service says are gone", async () => {
    const f = fakeDeps([row("lew")], { devices: { lew: ["https://push/old", "https://push/new"] }, gone: ["https://push/old"] });
    expect(await runReminders(f.deps, breakfastTime)).toMatchObject({ sent: 1, removedDevices: 1 });
    expect(f.deleted).toEqual(["https://push/old"]);
  });

  it("follows each person's time zone", async () => {
    // 08:05 in Vietnam is 02:05 in Paris: Paris user isn't due yet.
    const f = fakeDeps([row("lew"), row("marie", { timezone: "Europe/Paris" })]);
    await runReminders(f.deps, breakfastTime);
    expect(f.sent.map((s) => s.endpoint)).toEqual(["https://push/lew"]);
  });
});

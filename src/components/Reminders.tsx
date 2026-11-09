import { useEffect, useState } from "react";
import { DEFAULT_REMINDER_TIMES, REMINDER_SLOTS, type ReminderSlot, type ReminderTimes } from "../../shared/reminders.ts";
import { cloudEnabled, useSession } from "../lib/cloud.ts";
import { disableReminders, enableReminders, reminderSupport, sendTestReminder, serverPushKey } from "../lib/reminders.ts";
import { useAppState } from "../lib/store.ts";
import { MEAL_ICONS, MEAL_LABELS } from "../lib/types.ts";

/** Profile card for meal reminders. */
export default function Reminders() {
  const { reminders } = useAppState();
  const session = useSession();
  const support = reminderSupport();
  const [serverReady, setServerReady] = useState<boolean | null>(support.kind === "native" ? true : null);
  const [times, setTimes] = useState<ReminderTimes>(reminders.times);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    if (support.kind === "web") void serverPushKey().then((key) => setServerReady(Boolean(key)));
  }, [support.kind]);

  const changed = JSON.stringify(times) !== JSON.stringify(reminders.times);

  async function run(action: () => Promise<string | void>) {
    setBusy(true);
    setMessage(null);
    try {
      const text = await action();
      if (text) setMessage({ error: false, text });
    } catch (e) {
      setMessage({ error: true, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const setSlot = (slot: ReminderSlot, value: string | null) => setTimes({ ...times, [slot]: value });

  // Explain what's missing when reminders can't work here yet.
  let blocker: string | null = null;
  if (support.kind === "ios-needs-home-screen") {
    blocker =
      "On iPhone, reminders work from the home-screen app: in Safari tap Share → Add to Home Screen, then open FoodTrack from that icon and come back here.";
  } else if (support.kind === "unsupported") {
    blocker = "This browser can't show notifications. Try Safari or Chrome (not the browser inside Messenger or Zalo).";
  } else if (support.kind === "web" && (!cloudEnabled || !session)) {
    blocker = "Sign in above to get reminders. They only remind you about meals you haven't logged yet.";
  } else if (support.kind === "web" && serverReady === false) {
    blocker = "Reminders aren't set up on the server yet.";
  }

  return (
    <section className="card">
      <div className="row between">
        <div className="account-who">
          <h2 className="title">Meal reminders</h2>
          <span className="muted small">
            {support.kind === "native" ? "A nudge at meal times." : "A nudge at meal times, only if you haven't logged that meal yet."}
          </span>
        </div>
        <span className={`sync-dot ${reminders.enabled ? "ok" : ""}`} aria-hidden="true" />
      </div>

      {blocker ? (
        <p className="muted small">{blocker}</p>
      ) : (
        <>
          <div className="reminder-list">
            {REMINDER_SLOTS.map((slot) => (
              <label key={slot} className="reminder-row">
                <input
                  type="checkbox"
                  checked={times[slot] !== null}
                  onChange={(e) => setSlot(slot, e.target.checked ? DEFAULT_REMINDER_TIMES[slot] : null)}
                  aria-label={`${MEAL_LABELS[slot]} reminder`}
                />
                <span className="reminder-name">
                  <span aria-hidden="true">{MEAL_ICONS[slot]}</span> {MEAL_LABELS[slot]}
                </span>
                <input
                  type="time"
                  value={times[slot] ?? ""}
                  disabled={times[slot] === null}
                  onChange={(e) => setSlot(slot, e.target.value || null)}
                  aria-label={`${MEAL_LABELS[slot]} reminder time`}
                />
              </label>
            ))}
          </div>
          {message && <p className={message.error ? "error small" : "small"}>{message.text}</p>}
          <div className="row gap wrap">
            {!reminders.enabled ? (
              <button
                className="btn primary grow"
                disabled={busy || REMINDER_SLOTS.every((s) => times[s] === null)}
                onClick={() => run(async () => {
                  await enableReminders(times);
                  return "Reminders are on. 🎉";
                })}
              >
                {busy ? "Please wait…" : "Turn on reminders"}
              </button>
            ) : (
              <>
                {changed && (
                  <button className="btn primary" disabled={busy} onClick={() => run(async () => {
                    await enableReminders(times);
                    return "Saved.";
                  })}>
                    Save times
                  </button>
                )}
                <button className="btn" disabled={busy} onClick={() => run(async () => {
                  const sent = await sendTestReminder();
                  return sent ? "Test sent. It should appear in a few seconds." : "No devices are registered. Turn reminders off and on again.";
                })}>
                  Send a test
                </button>
                <button className="btn" disabled={busy} onClick={() => run(async () => {
                  await disableReminders();
                })}>
                  Turn off
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

import { useEffect, useState } from "react";
import { DEFAULT_REMINDER_TIMES, REMINDER_SLOTS, type ReminderSlot, type ReminderTimes } from "../../shared/reminders.ts";
import { cloudEnabled, useSession } from "../lib/cloud.ts";
import { disableReminders, enableReminders, reminderSupport, sendTestReminder, serverPushKey } from "../lib/reminders.ts";
import { useAppState } from "../lib/store.ts";
import { useI18n } from "../i18n/index.ts";
import { MEAL_ICONS } from "../lib/types.ts";

/** Profile card for meal reminders. */
export default function Reminders() {
  const { reminders } = useAppState();
  const session = useSession();
  const support = reminderSupport();
  const [serverReady, setServerReady] = useState<boolean | null>(support.kind === "native" ? true : null);
  const [times, setTimes] = useState<ReminderTimes>(reminders.times);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const { t } = useI18n();

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
    blocker = t("rem.iosHomeScreen");
  } else if (support.kind === "unsupported") {
    blocker = t("rem.unsupported");
  } else if (support.kind === "web" && (!cloudEnabled || !session)) {
    blocker = t("rem.needSignIn");
  } else if (support.kind === "web" && serverReady === false) {
    blocker = t("rem.serverOff");
  }

  return (
    <section className="card">
      <div className="row between">
        <div className="account-who">
          <h2 className="title">{t("rem.title")}</h2>
          <span className="muted small">{support.kind === "native" ? t("rem.subtitleNative") : t("rem.subtitleWeb")}</span>
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
                  aria-label={t("rem.toggle", { meal: t(`meal.${slot}`) })}
                />
                <span className="reminder-name">
                  <span aria-hidden="true">{MEAL_ICONS[slot]}</span> {t(`meal.${slot}`)}
                </span>
                <input
                  type="time"
                  value={times[slot] ?? ""}
                  disabled={times[slot] === null}
                  onChange={(e) => setSlot(slot, e.target.value || null)}
                  aria-label={t("rem.time", { meal: t(`meal.${slot}`) })}
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
                  return t("rem.on");
                })}
              >
                {busy ? t("common.pleaseWait") : t("rem.turnOn")}
              </button>
            ) : (
              <>
                {changed && (
                  <button className="btn primary" disabled={busy} onClick={() => run(async () => {
                    await enableReminders(times);
                    return t("rem.saved");
                  })}>
                    {t("rem.saveTimes")}
                  </button>
                )}
                <button className="btn" disabled={busy} onClick={() => run(async () => {
                  const sent = await sendTestReminder();
                  return sent ? t("rem.testSent") : t("rem.noDevices");
                })}>
                  {t("rem.test")}
                </button>
                <button className="btn" disabled={busy} onClick={() => run(async () => {
                  await disableReminders();
                })}>
                  {t("rem.turnOff")}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

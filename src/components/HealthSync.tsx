import { useEffect, useState } from "react";
import { useI18n } from "../i18n/index.ts";
import { timeAgo } from "../lib/dates.ts";
import { APPLE_HEALTH_ENABLED, connectHealth, disconnectHealth, healthAvailable, syncHealth } from "../lib/health.ts";
import { isNative } from "../lib/native.ts";
import { useAppState } from "../lib/store.ts";

/** Profile card for linking Apple Health (iPhone app). Hidden while the feature is switched off. */
export default function HealthSync() {
  return APPLE_HEALTH_ENABLED ? <HealthCard /> : null;
}

function HealthCard() {
  const { t, locale } = useI18n();
  const { health } = useAppState();
  const [available, setAvailable] = useState<boolean | null>(isNative ? null : false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    if (isNative) void healthAvailable().then(setAvailable);
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage({ error: true, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card apple-health">
      <div className="row between">
        <div className="account-who">
          <h2 className="title">
            {t("appleHealth.title")}
          </h2>
          <span className="muted small">{t("appleHealth.subtitle")}</span>
        </div>
        <span className={`sync-dot ${health.connected && available ? "ok" : ""}`} aria-hidden="true" />
      </div>

      {!isNative ? (
        <p className="muted small">{t("appleHealth.onlyApp")}</p>
      ) : available === false ? (
        <p className="muted small">{t("appleHealth.unavailable")}</p>
      ) : health.connected ? (
        <>
          <p className="small">
            {health.lastSync ? t("appleHealth.lastSync", { time: timeAgo(health.lastSync, locale) }) : t("common.pleaseWait")}
          </p>
          <div className="row gap wrap">
            <button className="btn" disabled={busy} onClick={() => void run(syncHealth)}>
              {busy ? t("common.pleaseWait") : t("appleHealth.syncNow")}
            </button>
            <button
              className="link small"
              onClick={() => {
                disconnectHealth();
                setMessage({ error: false, text: t("appleHealth.disconnected") });
              }}
            >
              {t("appleHealth.disconnect")}
            </button>
          </div>
          <p className="muted tiny">{t("appleHealth.how")}</p>
        </>
      ) : (
        <>
          <button className="btn primary" disabled={busy || available === null} onClick={() => void run(connectHealth)}>
            {busy ? t("common.pleaseWait") : t("appleHealth.connect")}
          </button>
          <p className="muted tiny">{t("appleHealth.how")}</p>
        </>
      )}
      {message && <p className={message.error ? "error small" : "small"}>{message.text}</p>}
    </section>
  );
}

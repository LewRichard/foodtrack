import { useEffect, useState, type ReactNode } from "react";
import { useI18n, type MessageKey } from "../i18n/index.ts";
import { useSession } from "../lib/cloud.ts";
import { localPrices, openCheckout, openPortal, useBillingConfig } from "../lib/billing.ts";
import { errorMessage } from "../lib/api.ts";
import { isNative } from "../lib/native.ts";
import { formatLongDate } from "../lib/dates.ts";
import { closePaywall, openPaywall, usePaywall, usePlan, type PaywallReason } from "../lib/plan.ts";
import { Icon, type IconName } from "./Icon.tsx";
import Sheet from "./Sheet.tsx";


const BENEFITS: { icon: IconName; key: MessageKey }[] = [
  { icon: "camera", key: "premium.b.unlimited" },
  { icon: "sparkles", key: "premium.b.coach" },
  { icon: "calendar", key: "premium.b.plans" },
  { icon: "trend-up", key: "premium.b.report" },
];

/** The upgrade screen, opened from anywhere with openPaywall(). Rendered once by App. */
export function PaywallHost() {
  const reason = usePaywall();
  return reason ? <PremiumSheet reason={reason} onClose={closePaywall} /> : null;
}

function PremiumSheet({ reason, onClose }: { reason: PaywallReason; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const plan = usePlan();
  const session = useSession();
  const premium = Boolean(plan?.premium && plan.enforced);

  return (
    <Sheet title="FoodTrack Premium" onClose={onClose}>
      <div className="premium">
        <div className="premium-hero">
          <span className="premium-mark" aria-hidden="true">
            <Icon name="sparkles" size={28} />
          </span>
          {premium ? (
            <>
              <h2>{t("premium.active")}</h2>
              <p className="muted">
                {plan?.until ? t("premium.until", { date: formatLongDate(plan.until.slice(0, 10), i18n) }) : t("premium.thanks")}
              </p>
            </>
          ) : (
            <>
              <h2>{t(reason === "limit" ? "premium.limitTitle" : "premium.title")}</h2>
              <p className="muted">
                {reason === "limit" ? t("premium.limitBody", { n: plan?.limit ?? 5 }) : t("premium.body", { n: plan?.limit ?? 5 })}
              </p>
            </>
          )}
        </div>

        <ul className="premium-list">
          {BENEFITS.map((b) => (
            <li key={b.key}>
              <span className="premium-icon" aria-hidden="true">
                <Icon name={b.icon} size={18} />
              </span>
              <span>{t(b.key)}</span>
              {premium && <Icon name="check" size={18} className="premium-check" />}
            </li>
          ))}
        </ul>

        {premium ? (
          <ManageButton />
        ) : (
          <div className="stack premium-cta">
            <Checkout limit={plan?.limit ?? 5} userId={session?.user.id ?? null} email={session?.user.email} />
            <button className="btn" onClick={onClose}>
              {t("premium.later")}
            </button>
            <p className="muted tiny center premium-legal">
              <a href="/terms.html" target="_blank" rel="noreferrer">
                {t("legal.terms")}
              </a>
              {" · "}
              <a href="/refund.html" target="_blank" rel="noreferrer">
                {t("legal.refund")}
              </a>
              {" · "}
              <a href="/privacy.html" target="_blank" rel="noreferrer">
                {t("profile.privacy")}
              </a>
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Shown in place of a Premium-only screen for free accounts. */
export function PremiumLock({ title, body }: { title: string; body: string }) {
  const { t } = useI18n();
  return (
    <section className="card premium-lock">
      <span className="premium-mark" aria-hidden="true">
        <Icon name="lock" size={22} />
      </span>
      <h2 className="title">{title}</h2>
      <p className="muted small">{body}</p>
      <button className="btn primary" onClick={() => openPaywall("feature")}>
        <Icon name="sparkles" size={18} /> {t("premium.unlock")}
      </button>
    </section>
  );
}

/** Small "Premium" tag for locked entry points. */
export function PremiumTag(): ReactNode {
  return <span className="premium-tag">Premium</span>;
}

/** Monthly / yearly choice with prices in the buyer's currency, and the button that opens Paddle. */
function Checkout({ limit, userId, email }: { limit: number; userId: string | null; email?: string }) {
  const { t, lang } = useI18n();
  const config = useBillingConfig();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState<"yearly" | "monthly">("yearly");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ids = config?.prices;
  const options = (["yearly", "monthly"] as const).filter((p) => ids?.[p]);
  const chosen = options.includes(period) ? period : options[0];

  useEffect(() => {
    if (config?.provider === "paddle" && !isNative) localPrices(config).then(setPrices, () => {});
  }, [config]);

  // Apple only allows its own in-app purchases for subscriptions inside the iPhone app.
  if (isNative) return <p className="muted small center">{t("premium.notInApp")}</p>;
  if (config === null) return <div className="spinner dark center-spinner" />;
  if (config.provider !== "paddle" || !chosen || !ids || !userId) {
    return (
      <>
        <button className="btn primary" disabled>
          {t("premium.soon")}
        </button>
        <p className="muted small center">{t("premium.soonBody", { n: limit })}</p>
      </>
    );
  }

  async function buy() {
    setBusy(true);
    setError("");
    try {
      await openCheckout(config!, ids![chosen!], { id: userId!, email }, lang);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {options.length > 1 && (
        <div className="premium-periods" role="radiogroup">
          {options.map((p) => (
            <button key={p} role="radio" aria-checked={chosen === p} className={`premium-period ${chosen === p ? "active" : ""}`} onClick={() => setPeriod(p)}>
              <span>{t(p === "yearly" ? "premium.yearly" : "premium.monthly")}</span>
              <strong>{prices[ids[p]] ?? "…"}</strong>
              {p === "yearly" && <span className="premium-save">{t("premium.bestValue")}</span>}
            </button>
          ))}
        </div>
      )}
      {options.length === 1 && prices[ids[chosen]] && <p className="premium-price">{prices[ids[chosen]]}</p>}
      <button className="btn primary" disabled={busy} onClick={() => void buy()}>
        {busy ? t("common.pleaseWait") : t("premium.upgrade")}
      </button>
      {error && <p className="error small center">{error}</p>}
    </>
  );
}

/** For Premium bought through Paddle: a link to update the card or cancel. */
function ManageButton() {
  const { t } = useI18n();
  const config = useBillingConfig();
  const [error, setError] = useState("");
  if (!config?.portal || isNative) return null;
  return (
    <div className="stack">
      <button
        className="btn"
        onClick={() => {
          setError("");
          openPortal().catch((e) => setError(e.code === "no_subscription" ? t("premium.noSubscription") : errorMessage(e)));
        }}
      >
        {t("premium.manage")}
      </button>
      {error && <p className="muted small center">{error}</p>}
    </div>
  );
}

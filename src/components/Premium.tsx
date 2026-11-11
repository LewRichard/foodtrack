import type { ReactNode } from "react";
import { useI18n, type MessageKey } from "../i18n/index.ts";
import { useSession } from "../lib/cloud.ts";
import { formatLongDate } from "../lib/dates.ts";
import { closePaywall, openPaywall, usePaywall, usePlan, type PaywallReason } from "../lib/plan.ts";
import { Icon, type IconName } from "./Icon.tsx";
import Sheet from "./Sheet.tsx";

// Where "Upgrade" goes: a hosted checkout page (Stripe Payment Link, Paddle, Lemon Squeezy…).
// Until one is set up, the screen says Premium is coming soon.
const CHECKOUT_URL = (import.meta.env.VITE_PREMIUM_CHECKOUT_URL ?? "").trim();
const PRICE = (import.meta.env.VITE_PREMIUM_PRICE ?? "").trim();

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

function checkoutLink(userId: string, email: string | undefined): string {
  // Stripe Payment Links read these two; other providers ignore unknown parameters.
  const url = new URL(CHECKOUT_URL);
  url.searchParams.set("client_reference_id", userId);
  if (email) url.searchParams.set("prefilled_email", email);
  return url.toString();
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

        {!premium && (
          <div className="stack premium-cta">
            {PRICE && <p className="premium-price">{PRICE}</p>}
            {CHECKOUT_URL && session ? (
              <a className="btn primary" href={checkoutLink(session.user.id, session.user.email)} target="_blank" rel="noreferrer">
                {t("premium.upgrade")}
              </a>
            ) : (
              <>
                <button className="btn primary" disabled>
                  {t("premium.soon")}
                </button>
                <p className="muted small center">{t("premium.soonBody", { n: plan?.limit ?? 5 })}</p>
              </>
            )}
            <button className="btn" onClick={onClose}>
              {t("premium.later")}
            </button>
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

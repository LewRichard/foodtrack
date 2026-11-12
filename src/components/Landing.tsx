import { useI18n, type MessageKey } from "../i18n/index.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { LanguagePicker } from "./AuthScreen.tsx";

const FEATURES: { icon: IconName; title: MessageKey; body: MessageKey }[] = [
  { icon: "camera", title: "landing.f1t", body: "landing.f1b" },
  { icon: "mic", title: "landing.f2t", body: "landing.f2b" },
  { icon: "barcode", title: "landing.f3t", body: "landing.f3b" },
  { icon: "leaf", title: "landing.f4t", body: "landing.f4b" },
  { icon: "sparkles", title: "landing.f5t", body: "landing.f5b" },
  { icon: "calendar", title: "landing.f6t", body: "landing.f6b" },
  { icon: "flame", title: "landing.f7t", body: "landing.f7b" },
  { icon: "globe", title: "landing.f8t", body: "landing.f8b" },
];

const FAQ: [MessageKey, MessageKey][] = [
  ["landing.q1", "landing.a1"],
  ["landing.q2", "landing.a2"],
  ["landing.q3", "landing.a3"],
  ["landing.q4", "landing.a4"],
];

/** The public front page for people who haven't signed in on the web. */
export default function Landing({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  const { t, lang } = useI18n();
  const shot = (name: string) => `/landing/${name}-${lang === "vi" ? "vi" : "en"}.jpg`;

  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="landing-brand" href="/">
          <img src="/icon.svg" alt="" width={32} height={32} />
          <span>FoodTrack</span>
        </a>
        <nav>
          <a href="/pricing.html" className="landing-navlink">
            {t("landing.pricing")}
          </a>
          <button className="btn small-btn" onClick={onSignIn}>
            {t("account.signIn")}
          </button>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-text">
          <p className="landing-kicker">{t("landing.kicker")}</p>
          <h1>{t("landing.heroTitle")}</h1>
          <p className="landing-lead">{t("landing.heroBody")}</p>
          <div className="landing-cta">
            <button className="btn primary" onClick={onStart}>
              {t("landing.start")} <Icon name="chevron-right" size={18} />
            </button>
            <a className="btn" href="#features">
              {t("landing.learnMore")}
            </a>
          </div>
          <p className="muted small">{t("landing.heroNote")}</p>
        </div>
        <div className="landing-phones" aria-hidden="true">
          <figure className="phone phone-back">
            <img src={shot("coach")} alt="" loading="lazy" />
          </figure>
          <figure className="phone phone-front">
            <img src={shot("today")} alt="" />
          </figure>
        </div>
      </section>

      <section className="landing-section" id="features">
        <h2>{t("landing.featuresTitle")}</h2>
        <div className="landing-features">
          {FEATURES.map((f) => (
            <article key={f.title} className="landing-feature">
              <span className="landing-feature-icon" aria-hidden="true">
                <Icon name={f.icon} size={22} />
              </span>
              <h3>{t(f.title)}</h3>
              <p className="muted">{t(f.body)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-split">
        <figure className="phone">
          <img src={shot("scan")} alt={t("landing.scanAlt")} loading="lazy" />
        </figure>
        <div>
          <h2>{t("landing.howTitle")}</h2>
          <ol className="landing-steps">
            {(["landing.s1", "landing.s2", "landing.s3"] as MessageKey[]).map((k, i) => (
              <li key={k}>
                <span className="landing-step-n">{i + 1}</span>
                <span>{t(k)}</span>
              </li>
            ))}
          </ol>
          <button className="btn primary" onClick={onStart}>
            {t("landing.start")}
          </button>
        </div>
      </section>

      <section className="landing-section">
        <h2>{t("landing.pricingTitle")}</h2>
        <div className="landing-plans">
          <article className="landing-plan">
            <h3>{t("premium.free")}</h3>
            <p className="landing-price">$0</p>
            <p className="muted">{t("landing.freeBody")}</p>
          </article>
          <article className="landing-plan featured">
            <h3>Premium</h3>
            <p className="landing-price">{t("landing.premiumPrice")}</p>
            <p className="muted">{t("landing.premiumBody")}</p>
          </article>
        </div>
        <p className="center">
          <a href="/pricing.html">{t("landing.comparePlans")}</a>
        </p>
      </section>

      <section className="landing-section landing-faq">
        <h2>{t("landing.faqTitle")}</h2>
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{t(q)}</summary>
            <p className="muted">{t(a)}</p>
          </details>
        ))}
      </section>

      <section className="landing-final">
        <h2>{t("landing.finalTitle")}</h2>
        <button className="btn primary" onClick={onStart}>
          {t("landing.start")}
        </button>
      </section>

      <footer className="landing-footer">
        <LanguagePicker />
        <nav>
          <a href="/pricing.html">{t("landing.pricing")}</a>
          <a href="/terms.html">{t("legal.terms")}</a>
          <a href="/privacy.html">{t("profile.privacy")}</a>
          <a href="/refund.html">{t("legal.refund")}</a>
          <a href="mailto:support@foodtrack.fit">support@foodtrack.fit</a>
        </nav>
        <p className="muted tiny">© {new Date().getFullYear()} FoodTrack</p>
      </footer>
    </div>
  );
}

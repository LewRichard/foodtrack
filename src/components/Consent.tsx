import { useI18n } from "../i18n/index.ts";
import { isNative } from "../lib/native.ts";
import Sheet from "./Sheet.tsx";

/** Shown before the first photo is sent to the AI service. App stores require this disclosure. */
export default function Consent({ onAccept, onClose }: { onAccept: () => void; onClose: () => void }) {
  const { t, tr } = useI18n();
  return (
    <Sheet title={t("consent.title")} onClose={onClose}>
      <p>{t("consent.intro")}</p>
      <ul className="consent-list">
        <li>{t("consent.point1")}</li>
        <li>{t("consent.point2")}</li>
        <li>{t("consent.point3")}</li>
        <li>{t("consent.point4")}</li>
      </ul>
      <p className="muted small">
        {tr("consent.footer", {
          link: (
            <a href="/privacy.html" target={isNative ? undefined : "_blank"} rel="noreferrer">
              {t("consent.privacyLink")}
            </a>
          ),
        })}
      </p>
      <div className="row gap">
        <button className="btn" onClick={onClose}>
          {t("consent.notNow")}
        </button>
        <button className="btn primary grow" onClick={onAccept}>
          {t("consent.agree")}
        </button>
      </div>
    </Sheet>
  );
}

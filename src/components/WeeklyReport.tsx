import { useRef, useState } from "react";
import { useI18n } from "../i18n/index.ts";
import { errorMessage, fetchWeeklyReport } from "../lib/api.ts";
import { addDays, formatLongDate, timeAgo, todayKey } from "../lib/dates.ts";
import { buildWeek, daysLogged } from "../lib/report.ts";
import { actions, getState, useAppState } from "../lib/store.ts";
import { ScoreRing, tierLabel } from "./HealthScore.tsx";
import { Icon, type IconName } from "./Icon.tsx";

const MIN_DAYS = 2;

/** The AI weekly check-in card at the top of Trends. */
export default function WeeklyReportCard() {
  const state = useAppState();
  const i18n = useI18n();
  const { t, locale } = i18n;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const today = todayKey();
  const logged = daysLogged(buildWeek(state, today));
  const latestKey = Object.keys(state.reports).sort().at(-1);
  const saved = latestKey ? state.reports[latestKey] : null;
  const isCurrent = latestKey === today;

  async function create() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError("");
    try {
      const report = await fetchWeeklyReport(buildWeek(getState(), today), i18n.lang, controller.signal);
      actions.saveReport(today, report);
    } catch (e) {
      if (!controller.signal.aborted) setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const button = (
    <button className={`btn ${saved ? "" : "primary"}`} disabled={busy || logged < MIN_DAYS} onClick={create}>
      {busy ? t("report.writing") : saved ? t("report.refresh") : t("report.create")}
    </button>
  );

  return (
    <section className="card report-card">
      <div className="row between">
        <h2 className="title">{t("report.title")}</h2>
        {saved && <span className="muted tiny">{t("report.created", { when: timeAgo(saved.createdAt, locale) })}</span>}
      </div>

      {!saved && (
        <>
          <p className="muted small">{t("report.intro")}</p>
          {logged < MIN_DAYS && <p className="small">{t("report.needDays", { n: MIN_DAYS, logged })}</p>}
        </>
      )}

      {saved && (
        <>
          {!isCurrent && latestKey && (
            <p className="muted small">
              {t("report.forWeek", { from: formatLongDate(addDays(latestKey, -6), i18n), to: formatLongDate(latestKey, i18n) })}
            </p>
          )}
          <div className="report-head">
            <ScoreRing score={saved.report.score} size={60} />
            <div>
              <strong className="report-headline">{saved.report.headline}</strong>
              <span className="muted small">
                {t("report.weekScore", { score: saved.report.score })} · {t(tierLabel(saved.report.score))}
              </span>
            </div>
          </div>
          <p className="report-summary">{saved.report.summary}</p>
          <ReportList icon="check" title={t("report.wins")} items={saved.report.wins} />
          <ReportList icon="wrench" title={t("report.improve")} items={saved.report.improvements} />
          <ReportList icon="target" title={t("report.nextWeek")} items={saved.report.nextWeek} />
          {saved.report.mealIdea && (
            <div className="report-idea">
              <p className="label"><Icon name="utensils" size={14} /> {t("report.mealIdea")}</p>
              <p className="small">{saved.report.mealIdea}</p>
            </div>
          )}
        </>
      )}

      {busy && (
        <div className="row gap center-items" role="status">
          <div className="spinner dark small-spinner" />
          <span className="muted small">{t("report.writingLong")}</span>
        </div>
      )}
      {error && <p className="error small">{error}</p>}
      {!busy && button}
      <p className="muted tiny">{t("report.privacy")}</p>
    </section>
  );
}

function ReportList({ icon, title, items }: { icon: IconName; title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="report-list">
      <p className="label">
        <Icon name={icon} size={14} /> {title}
      </p>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

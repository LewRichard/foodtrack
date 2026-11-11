import { useEffect, useMemo, useState } from "react";
import { useI18n, type MessageKey } from "../i18n/index.ts";
import { badges, newBadges, streak, type Badge } from "../lib/achievements.ts";
import { actions, useAppState } from "../lib/store.ts";
import { cloudEnabled, useSession } from "../lib/cloud.ts";
import Sheet from "./Sheet.tsx";

const name = (b: Badge) => `badge.${b.id}` as MessageKey;
const desc = (b: Badge) => `badge.${b.id}.desc` as MessageKey;

/** "🔥 5" next to the greeting; opens the achievements. */
export function StreakChip() {
  const state = useAppState();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const s = streak(state);
  return (
    <>
      <button
        className={`streak-chip ${s.current > 0 && !s.loggedToday ? "at-risk" : ""} ${s.current === 0 ? "cold" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={t("streak.aria", { n: s.current })}
      >
        <span aria-hidden="true">🔥</span> {s.current}
      </button>
      {open && (
        <Sheet title={t("streak.achievements")} onClose={() => setOpen(false)}>
          <AchievementsPanel />
        </Sheet>
      )}
    </>
  );
}

/** Streak summary and every badge (earned in colour, others with progress). */
export function AchievementsPanel() {
  const state = useAppState();
  const { t, tp, num } = useI18n();
  const s = streak(state);
  const all = useMemo(() => badges(state), [state]);
  const earned = all.filter((b) => b.earned).length;
  const session = useSession();

  return (
    <div className="stack achievements">
      <div className="streak-hero">
        <span className="streak-flame" aria-hidden="true">
          🔥
        </span>
        <div>
          <strong>{tp("streak.days", s.current)}</strong>
          <span className="muted small">
            {s.current === 0
              ? t("streak.start")
              : s.loggedToday
                ? t("streak.keptToday")
                : t("streak.logToday")}
          </span>
          <span className="muted small">{t("streak.longest", { n: s.longest })}</span>
        </div>
      </div>

      {cloudEnabled && session && (
        <button
          className="btn lb-open"
          onClick={() => {
            try {
              sessionStorage.setItem("foodtrack:communitySection", "leaderboard");
            } catch {
              // storage unavailable: Community opens on its feed
            }
            window.dispatchEvent(new CustomEvent("foodtrack:navigate", { detail: "community" }));
          }}
        >
          🏆 {t("lb.open")}
        </button>
      )}

      <p className="label">{t("streak.badges", { n: earned, total: all.length })}</p>
      <div className="badge-grid">
        {all.map((b) => (
          <div key={b.id} className={`badge-tile ${b.earned ? "earned" : "locked"}`} title={t(desc(b))}>
            <span className="badge-icon" aria-hidden="true">
              {b.icon}
            </span>
            <strong className="small">{t(name(b))}</strong>
            <span className="muted tiny">{t(desc(b))}</span>
            {!b.earned && (
              <>
                <div className="badge-progress" aria-hidden="true">
                  <div style={{ width: `${(b.progress / b.target) * 100}%` }} />
                </div>
                <span className="muted tiny">
                  {num(b.progress, b.progress % 1 ? 1 : 0)}/{num(b.target)}
                </span>
              </>
            )}
            {b.earned && <span className="badge-done tiny">✓ {t("streak.earned")}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Celebrates badges the moment they're earned. The first time it runs on a device it just notes
 * what's already earned, so people who've used the app for months don't get twenty pop-ups.
 */
export function BadgeCelebration() {
  const state = useAppState();
  const { t } = useI18n();
  const all = useMemo(() => badges(state), [state]);
  const fresh = state.seenBadges === null ? [] : newBadges(all, state.seenBadges);

  useEffect(() => {
    if (state.seenBadges === null) actions.markBadgesSeen(all.filter((b) => b.earned).map((b) => b.id));
  }, [state.seenBadges, all]);

  if (!fresh.length) return null;
  const close = () => actions.markBadgesSeen(fresh.map((b) => b.id));
  return (
    <Sheet title={t("streak.newBadge")} onClose={close}>
      <div className="celebrate">
        <div className="celebrate-icons" aria-hidden="true">
          {fresh.slice(0, 3).map((b) => (
            <span key={b.id}>{b.icon}</span>
          ))}
        </div>
        {fresh.map((b) => (
          <div key={b.id}>
            <strong>{t(name(b))}</strong>
            <p className="muted small">{t(desc(b))}</p>
          </div>
        ))}
        <button className="btn primary" onClick={close}>
          {t("streak.great")}
        </button>
      </div>
    </Sheet>
  );
}

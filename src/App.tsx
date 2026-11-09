import { lazy, Suspense, useEffect, useState } from "react";
import Goals from "./components/Goals.tsx";
import History from "./components/History.tsx";
import Profile from "./components/Profile.tsx";
import Scan from "./components/Scan.tsx";
import Today, { ScanIcon } from "./components/Today.tsx";
import { useI18n, type MessageKey } from "./i18n/index.ts";
import { cloudEnabled, useAuthState, usePasswordRecovery, useSession } from "./lib/cloud.ts";
import { useSyncStatus } from "./lib/sync.ts";
import AuthScreen from "./components/AuthScreen.tsx";
import Onboarding from "./components/Onboarding.tsx";
import { refreshAlerts, useCommunityAlerts } from "./lib/community.ts";
import { todayKey } from "./lib/dates.ts";
import { useAppState } from "./lib/store.ts";
import { watchTheme } from "./lib/theme.ts";

type Tab = "today" | "history" | "scan" | "community" | "goals" | "profile";

// Loaded when first opened, so the rest of the app starts faster.
const Community = lazy(() => import("./components/Community.tsx"));

// Goals is opened from Profile, so the bar has room for Community.
const TABS: { id: Exclude<Tab, "scan" | "goals">; label: MessageKey; icon: string }[] = [
  { id: "today", label: "tab.diary", icon: "M4 6h16M4 12h16M4 18h10" },
  { id: "history", label: "tab.trends", icon: "M6 20V11M12 20V5M18 20v-8" },
  {
    id: "community",
    label: "tab.community",
    icon: "M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7M2.5 20a6.5 6.5 0 0 1 13 0M16 4.2a3.5 3.5 0 0 1 0 6.6M18.5 14a6.5 6.5 0 0 1 3 6",
  },
  { id: "profile", label: "tab.profile", icon: "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0" },
];

const TAB_IDS: Tab[] = ["today", "history", "scan", "community", "goals", "profile"];

/** A notification can open the app on a given tab, e.g. /?tab=scan. */
function tabFromUrl(): Tab {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab") as Tab | null;
  if (tab && TAB_IDS.includes(tab)) {
    // A Community notification also says which part to open (chats, friends).
    const section = params.get("section");
    if (tab === "community" && section) {
      try {
        sessionStorage.setItem("foodtrack:communitySection", section);
      } catch {
        // storage unavailable: opens on the feed
      }
    }
    window.history.replaceState(null, "", window.location.pathname);
    return tab;
  }
  return "today";
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  const { t, lang } = useI18n();

  const appState = useAppState();
  const { theme } = appState;
  const auth = useAuthState();
  const recovering = usePasswordRecovery();
  const syncStatus = useSyncStatus();
  const session = useSession();
  const alerts = useCommunityAlerts(session?.user.id ?? null);
  const badge = alerts.messages + alerts.requests;
  useEffect(() => watchTheme(theme), [theme]);

  // Screen readers and the browser's own UI (e.g. translation offers) follow the page language.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // A Community notification arrived while the app was open: refresh the badge instead of a banner.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === "community-activity") refreshAlerts();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, []);

  // Tapping a reminder in the iPhone app asks to open a tab.
  useEffect(() => {
    const open = (e: Event) => {
      const next = (e as CustomEvent<string>).detail as Tab;
      if (TAB_IDS.includes(next)) setTab(next);
    };
    window.addEventListener("foodtrack:navigate", open);
    return () => window.removeEventListener("foodtrack:navigate", open);
  }, []);
  const [date, setDate] = useState(todayKey());

  const navButton = (item: (typeof TABS)[number]) => (
    <button
      key={item.id}
      className={`tab ${tab === item.id || (item.id === "profile" && tab === "goals") ? "active" : ""}`}
      onClick={() => setTab(item.id)}
      aria-current={tab === item.id ? "page" : undefined}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={item.icon} />
      </svg>
      <span>{t(item.label)}</span>
      {item.id === "community" && badge > 0 && <span className="tab-badge">{badge > 99 ? "99+" : badge}</span>}
    </button>
  );

  // Accounts are set up: sign in first, then (for new accounts) a few welcome questions.
  if (cloudEnabled) {
    if (auth === "checking") return <Splash />;
    if (auth === "signedOut" || recovering) return <AuthScreen />;
    if (!appState.profile && !appState.onboardingSkipped) {
      // Wait for the first sync, so people who already answered on another device skip the questions.
      const synced = appState.sync.lastSyncedAt !== null || syncStatus.kind === "error" || syncStatus.kind === "offline";
      return synced ? <Onboarding /> : <Splash />;
    }
  }

  return (
    <div className="app">
      <main className="content">
        {tab === "today" && (
          <Today
            date={date}
            onDateChange={setDate}
            onScan={() => setTab("scan")}
            onOpenProfile={() => setTab("profile")}
            onSeeAll={() => setTab("history")}
          />
        )}
        {tab === "scan" && (
          <Scan
            date={date}
            onLogged={() => setTab("today")}
            onCancel={() => setTab("today")}
            onSignIn={() => setTab("profile")}
          />
        )}
        {tab === "history" && (
          <History
            onPickDate={(d) => {
              setDate(d);
              setTab("today");
            }}
          />
        )}
        {tab === "community" && (
          <Suspense fallback={<div className="page center-page"><div className="spinner dark" /></div>}>
            <Community onSignIn={() => setTab("profile")} alerts={alerts} />
          </Suspense>
        )}
        {tab === "goals" && <Goals onBack={() => setTab("profile")} />}
        {tab === "profile" && <Profile onEditGoals={() => setTab("goals")} />}
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.slice(0, 2).map(navButton)}
        <button
          className={`tab-scan ${tab === "scan" ? "active" : ""}`}
          onClick={() => setTab("scan")}
          aria-label={t("tab.scan")}
          aria-current={tab === "scan" ? "page" : undefined}
        >
          <ScanIcon />
        </button>
        {TABS.slice(2).map(navButton)}
      </nav>
    </div>
  );
}

function Splash() {
  return (
    <div className="splash" aria-busy="true">
      <img src="/icon.svg" alt="FoodTrack" className="auth-logo" />
      <div className="spinner dark small-spinner" />
    </div>
  );
}

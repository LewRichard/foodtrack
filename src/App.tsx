import { useEffect, useState } from "react";
import Goals from "./components/Goals.tsx";
import History from "./components/History.tsx";
import Profile from "./components/Profile.tsx";
import Scan from "./components/Scan.tsx";
import Today, { ScanIcon } from "./components/Today.tsx";
import { useI18n, type MessageKey } from "./i18n/index.ts";
import { todayKey } from "./lib/dates.ts";

type Tab = "today" | "history" | "scan" | "goals" | "profile";

const TABS: { id: Exclude<Tab, "scan">; label: MessageKey; icon: string }[] = [
  { id: "today", label: "tab.diary", icon: "M4 6h16M4 12h16M4 18h10" },
  { id: "history", label: "tab.trends", icon: "M6 20V11M12 20V5M18 20v-8" },
  { id: "goals", label: "tab.goals", icon: "M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18M12 16a4 4 0 1 0 0-8a4 4 0 0 0 0 8" },
  { id: "profile", label: "tab.profile", icon: "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0" },
];

const TAB_IDS: Tab[] = ["today", "history", "scan", "goals", "profile"];

/** A notification can open the app on a given tab, e.g. /?tab=scan. */
function tabFromUrl(): Tab {
  const tab = new URLSearchParams(window.location.search).get("tab") as Tab | null;
  if (tab && TAB_IDS.includes(tab)) {
    window.history.replaceState(null, "", window.location.pathname);
    return tab;
  }
  return "today";
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  const { t, lang } = useI18n();

  // Screen readers and the browser's own UI (e.g. translation offers) follow the page language.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

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
      className={`tab ${tab === item.id ? "active" : ""}`}
      onClick={() => setTab(item.id)}
      aria-current={tab === item.id ? "page" : undefined}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={item.icon} />
      </svg>
      <span>{t(item.label)}</span>
    </button>
  );

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
        {tab === "goals" && <Goals />}
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

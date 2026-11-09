import { useState } from "react";
import Goals from "./components/Goals.tsx";
import History from "./components/History.tsx";
import Profile from "./components/Profile.tsx";
import Scan from "./components/Scan.tsx";
import Today, { ScanIcon } from "./components/Today.tsx";
import { todayKey } from "./lib/dates.ts";

type Tab = "today" | "history" | "scan" | "goals" | "profile";

const TABS: { id: Exclude<Tab, "scan">; label: string; icon: string }[] = [
  { id: "today", label: "Diary", icon: "M4 6h16M4 12h16M4 18h10" },
  { id: "history", label: "Trends", icon: "M6 20V11M12 20V5M18 20v-8" },
  { id: "goals", label: "Goals", icon: "M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18M12 16a4 4 0 1 0 0-8a4 4 0 0 0 0 8" },
  { id: "profile", label: "Profile", icon: "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [date, setDate] = useState(todayKey());

  const navButton = (t: (typeof TABS)[number]) => (
    <button
      key={t.id}
      className={`tab ${tab === t.id ? "active" : ""}`}
      onClick={() => setTab(t.id)}
      aria-current={tab === t.id ? "page" : undefined}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={t.icon} />
      </svg>
      <span>{t.label}</span>
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
          aria-label="Scan a meal"
          aria-current={tab === "scan" ? "page" : undefined}
        >
          <ScanIcon />
        </button>
        {TABS.slice(2).map(navButton)}
      </nav>
    </div>
  );
}

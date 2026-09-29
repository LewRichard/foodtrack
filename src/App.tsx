import { useState } from "react";
import History from "./components/History.tsx";
import Scan from "./components/Scan.tsx";
import Settings from "./components/Settings.tsx";
import Today from "./components/Today.tsx";
import { todayKey } from "./lib/dates.ts";

type Tab = "today" | "scan" | "history" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "Diary", icon: "M4 5h16M4 12h16M4 19h10" },
  { id: "scan", label: "Scan", icon: "M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0" },
  { id: "history", label: "Trends", icon: "M5 20V10M12 20V4M19 20v-7" },
  { id: "settings", label: "Goals", icon: "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [date, setDate] = useState(todayKey());

  return (
    <div className="app">
      <main className="content">
        {tab === "today" && <Today date={date} onDateChange={setDate} onScan={() => setTab("scan")} />}
        {tab === "scan" && (
          <Scan
            date={date}
            onLogged={() => setTab("today")}
            onCancel={() => setTab("today")}
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
        {tab === "settings" && <Settings />}
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "active" : ""} ${t.id === "scan" ? "tab-scan" : ""}`}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

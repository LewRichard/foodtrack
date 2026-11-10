// What Lew, the AI nutritionist, gets to know about the person with each message.

import type { ChatTurn } from "./api.ts";
import { todayKey } from "./dates.ts";
import { buildWeek } from "./report.ts";
import type { AppState, CoachMessage } from "./store.ts";

export function coachContext(s: AppState) {
  const today = todayKey();
  return { today, name: s.name.slice(0, 80), profile: s.profile, week: buildWeek(s, today) };
}

/** The recent conversation to send: replies that failed are left out, and it always ends with the person. */
export function turnsToSend(history: CoachMessage[], limit = 20): ChatTurn[] {
  const turns = history.filter((m) => !m.failed && m.content.trim()).map(({ role, content }) => ({ role, content: content.slice(0, 4000) }));
  // Merge back-to-back messages from the same side (e.g. two questions after a failed reply).
  const merged: ChatTurn[] = [];
  for (const turn of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) last.content = `${last.content}\n\n${turn.content}`.slice(0, 4000);
    else merged.push({ ...turn });
  }
  const recent = merged.slice(-limit);
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent;
}

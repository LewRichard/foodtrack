/** The AI's weekly check-in (returned by POST /api/report/weekly). */
export interface WeeklyReport {
  headline: string;
  score: number; // 1–10
  summary: string;
  wins: string[];
  improvements: string[];
  nextWeek: string[];
  mealIdea: string;
}

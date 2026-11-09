// Meal reminders: when each one is due, shared by the server (web push) and tests.

import { isLang, type Lang } from "./languages.ts";

export type ReminderSlot = "breakfast" | "lunch" | "dinner";
export const REMINDER_SLOTS: ReminderSlot[] = ["breakfast", "lunch", "dinner"];

/** Times are local "HH:MM" in the person's time zone; null switches that reminder off. */
export interface ReminderTimes {
  breakfast: string | null;
  lunch: string | null;
  dinner: string | null;
}

export const DEFAULT_REMINDER_TIMES: ReminderTimes = { breakfast: "08:00", lunch: "12:30", dinner: "19:00" };

/**
 * A reminder can go out until this many minutes after its time. The server is woken every
 * ~10 minutes and may take a minute to start, so this leaves room for a couple of late runs.
 */
export const REMINDER_WINDOW_MINUTES = 45;

type NotificationText = { title: string; body: string };

/** Notification texts in each language (the server sends these, so they live outside the app's dictionaries). */
const TEXTS: Record<Lang, Record<ReminderSlot | "test", NotificationText>> = {
  en: {
    breakfast: { title: "🍳 Breakfast time", body: "Snap your breakfast to log it in seconds." },
    lunch: { title: "🥗 Lunch time", body: "Don't forget to log your lunch. Just take a photo." },
    dinner: { title: "🍲 Dinner time", body: "Log your dinner to keep today's diary complete." },
    test: { title: "✅ Reminders are on", body: "This is how FoodTrack will remind you to log meals." },
  },
  vi: {
    breakfast: { title: "🍳 Đến giờ ăn sáng", body: "Chụp bữa sáng để ghi lại chỉ trong vài giây." },
    lunch: { title: "🥗 Đến giờ ăn trưa", body: "Đừng quên ghi bữa trưa nhé. Chỉ cần chụp một tấm ảnh." },
    dinner: { title: "🍲 Đến giờ ăn tối", body: "Ghi lại bữa tối để hoàn thành nhật ký hôm nay." },
    test: { title: "✅ Đã bật nhắc nhở", body: "FoodTrack sẽ nhắc bạn ghi bữa ăn như thế này." },
  },
  es: {
    breakfast: { title: "🍳 Hora del desayuno", body: "Fotografía tu desayuno para registrarlo en segundos." },
    lunch: { title: "🥗 Hora de comer", body: "No olvides registrar tu comida. Solo saca una foto." },
    dinner: { title: "🍲 Hora de cenar", body: "Registra tu cena para completar el diario de hoy." },
    test: { title: "✅ Recordatorios activados", body: "Así te recordará FoodTrack que registres tus comidas." },
  },
  pt: {
    breakfast: { title: "🍳 Hora do café da manhã", body: "Tire uma foto do café da manhã para registrá-lo em segundos." },
    lunch: { title: "🥗 Hora do almoço", body: "Não se esqueça de registrar o almoço. É só tirar uma foto." },
    dinner: { title: "🍲 Hora do jantar", body: "Registre o jantar para completar o diário de hoje." },
    test: { title: "✅ Lembretes ativados", body: "É assim que o FoodTrack vai lembrar você de registrar as refeições." },
  },
  fr: {
    breakfast: { title: "🍳 C'est l'heure du petit-déjeuner", body: "Prenez votre petit-déjeuner en photo pour l'enregistrer en quelques secondes." },
    lunch: { title: "🥗 C'est l'heure du déjeuner", body: "N'oubliez pas d'enregistrer votre déjeuner. Une photo suffit." },
    dinner: { title: "🍲 C'est l'heure du dîner", body: "Enregistrez votre dîner pour compléter le journal du jour." },
    test: { title: "✅ Rappels activés", body: "Voici comment FoodTrack vous rappellera d'enregistrer vos repas." },
  },
  de: {
    breakfast: { title: "🍳 Zeit fürs Frühstück", body: "Fotografiere dein Frühstück, um es in Sekunden einzutragen." },
    lunch: { title: "🥗 Zeit fürs Mittagessen", body: "Vergiss nicht, dein Mittagessen einzutragen. Einfach ein Foto machen." },
    dinner: { title: "🍲 Zeit fürs Abendessen", body: "Trage dein Abendessen ein, damit dein Tagebuch für heute vollständig ist." },
    test: { title: "✅ Erinnerungen sind an", body: "So erinnert dich FoodTrack daran, deine Mahlzeiten einzutragen." },
  },
  zh: {
    breakfast: { title: "🍳 早餐时间到了", body: "拍一下早餐，几秒钟就能记录。" },
    lunch: { title: "🥗 午餐时间到了", body: "别忘了记录午餐，拍张照片就好。" },
    dinner: { title: "🍲 晚餐时间到了", body: "记录晚餐，让今天的饮食日记更完整。" },
    test: { title: "✅ 提醒已开启", body: "FoodTrack 会像这样提醒你记录饮食。" },
  },
  ja: {
    breakfast: { title: "🍳 朝ごはんの時間です", body: "朝ごはんを撮影して、数秒で記録しましょう。" },
    lunch: { title: "🥗 お昼ごはんの時間です", body: "お昼ごはんの記録を忘れずに。写真を撮るだけです。" },
    dinner: { title: "🍲 晩ごはんの時間です", body: "晩ごはんを記録して、今日の記録を完成させましょう。" },
    test: { title: "✅ リマインダーをオンにしました", body: "FoodTrack はこのように食事の記録をお知らせします。" },
  },
  ko: {
    breakfast: { title: "🍳 아침 식사 시간이에요", body: "아침 식사를 찍어서 몇 초 만에 기록하세요." },
    lunch: { title: "🥗 점심 식사 시간이에요", body: "점심 기록을 잊지 마세요. 사진 한 장이면 돼요." },
    dinner: { title: "🍲 저녁 식사 시간이에요", body: "저녁 식사를 기록해서 오늘의 기록을 완성하세요." },
    test: { title: "✅ 알림이 켜졌어요", body: "FoodTrack이 이렇게 식사 기록을 알려 드려요." },
  },
};

export function reminderText(language: unknown, slot: ReminderSlot): NotificationText {
  return TEXTS[isLang(language) ? language : "en"][slot];
}

export function testReminderText(language: unknown): NotificationText {
  return TEXTS[isLang(language) ? language : "en"].test;
}

/** Minutes since midnight for "HH:MM" (also accepts Postgres "HH:MM:SS"), or null. */
export function parseTime(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** The local date (YYYY-MM-DD) and minutes since midnight at `now` in `timeZone` (UTC if unknown). */
export function localClock(now: Date, timeZone: string): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return localClock(now, "UTC");
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/**
 * Which reminders should go out now: their time has passed within the window today (local time)
 * and they haven't already been handled today (`lastSent[slot]` holds the local date last handled).
 */
export function dueReminders(
  times: ReminderTimes,
  timeZone: string,
  lastSent: Partial<Record<ReminderSlot, string>>,
  now: Date,
): { date: string; slots: ReminderSlot[] } {
  const { date, minutes } = localClock(now, timeZone);
  const slots = REMINDER_SLOTS.filter((slot) => {
    const at = parseTime(times[slot]);
    if (at === null || lastSent[slot] === date) return false;
    return minutes >= at && minutes < at + REMINDER_WINDOW_MINUTES;
  });
  return { date, slots };
}

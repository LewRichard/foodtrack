import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Gym reminders are local notifications, so they work without a push server. Instead of one
// repeating notification we schedule the next week of one-off reminders and skip today once the
// user has checked in — nobody wants "don't break your streak!" after they already went.

const KEY = 'reminder-settings';
const DAYS_AHEAD = 7;

export type ReminderSettings = { enabled: boolean; hour: number; minute: number };

const DEFAULTS: ReminderSettings = { enabled: false, hour: 18, minute: 0 };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function getReminderSettings(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export async function saveReminderSettings(settings: ReminderSettings): Promise<boolean> {
  if (settings.enabled) {
    const granted = await ensurePermission();
    if (!granted) return false;
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  return true;
}

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Gym reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Re-plans the next week of reminders. Call on launch, after a check-in and when settings change. */
export async function scheduleReminders(opts: { checkedInToday: boolean; streakWeeks: number }): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const settings = await getReminderSettings();
  if (!settings.enabled) return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;

  const now = new Date();
  for (let i = 0; i < DAYS_AHEAD; i++) {
    if (i === 0 && opts.checkedInToday) continue;
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, settings.hour, settings.minute);
    if (at <= now) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Gym time? 🏋️',
        body:
          opts.streakWeeks > 0
            ? `Keep your ${opts.streakWeeks}-week streak alive — snap your check-in.`
            : 'Snap a check-in photo and start a streak with your friends.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
      },
    });
  }
}

import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { GoalPicker } from '@/components/GoalPicker';
import { Avatar, Body, Button, Card, Field, SectionLabel } from '@/components/ui';
import { deleteAccount, fetchCheckinDays, upsertProfile } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';
import { getReminderSettings, saveReminderSettings, scheduleReminders, type ReminderSettings } from '@/lib/reminders';
import { summarize, toDayKey } from '@/lib/streaks';
import { supabase } from '@/lib/supabase';
import { colors, radius, space } from '@/lib/theme';

const TIMES = [
  { label: '7 AM', hour: 7 },
  { label: '12 PM', hour: 12 },
  { label: '5 PM', hour: 17 },
  { label: '7 PM', hour: 19 },
];

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL;
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;

export default function Profile() {
  const me = useMe();
  const { setProfile } = useAuth();
  const [displayName, setDisplayName] = useState(me.display_name);
  const [reminders, setReminders] = useState<ReminderSettings | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getReminderSettings().then(setReminders);
  }, []);

  async function saveProfile(fields: Partial<{ display_name: string; weekly_goal: number }>) {
    try {
      setProfile(
        await upsertProfile(me.id, {
          username: me.username,
          display_name: fields.display_name ?? me.display_name,
          weekly_goal: fields.weekly_goal ?? me.weekly_goal,
        }),
      );
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    }
  }

  async function updateReminders(next: ReminderSettings) {
    const ok = await saveReminderSettings(next);
    if (!ok) {
      Alert.alert('Notifications are off', 'Allow notifications for GymStreak in Settings to get reminders.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    setReminders(next);
    const days = (await fetchCheckinDays([me.id]).catch(() => new Map<string, string[]>())).get(me.id) ?? [];
    const summary = summarize(days, me.weekly_goal, toDayKey(new Date()));
    await scheduleReminders({ checkedInToday: summary.checkedInToday, streakWeeks: summary.weekStreak });
  }

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your profile, every check-in photo and your friendships. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount(me.id);
            } catch (e) {
              setDeleting(false);
              Alert.alert('Could not delete account', (e as Error).message);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container}>
      <Card style={styles.identity}>
        <Avatar name={me.display_name} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{me.display_name}</Text>
          <Text style={styles.sub}>@{me.username}</Text>
        </View>
      </Card>

      <SectionLabel>Name</SectionLabel>
      <Field
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={40}
        onEndEditing={() => displayName.trim() && displayName !== me.display_name && saveProfile({ display_name: displayName.trim() })}
      />

      <SectionLabel>Weekly goal (gym days)</SectionLabel>
      <GoalPicker value={me.weekly_goal} onChange={(weekly_goal) => saveProfile({ weekly_goal })} />

      <SectionLabel>Reminders</SectionLabel>
      {reminders ? (
        <Card style={{ gap: space.md }}>
          <View style={styles.switchRow}>
            <Body style={{ flex: 1 }}>Remind me to check in</Body>
            <Switch
              value={reminders.enabled}
              trackColor={{ true: colors.accent }}
              onValueChange={(enabled) => updateReminders({ ...reminders, enabled })}
            />
          </View>
          {reminders.enabled ? (
            <View style={styles.times}>
              {TIMES.map((t) => {
                const selected = reminders.hour === t.hour && reminders.minute === 0;
                return (
                  <Pressable
                    key={t.hour}
                    onPress={() => updateReminders({ ...reminders, hour: t.hour, minute: 0 })}
                    style={[styles.time, selected && styles.timeOn]}
                  >
                    <Text style={[styles.timeLabel, selected && { color: colors.accentText }]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <Body muted style={{ fontSize: 13 }}>Skipped automatically on days you’ve already checked in.</Body>
        </Card>
      ) : null}

      <SectionLabel>Account</SectionLabel>
      <View style={{ gap: space.sm }}>
        {PRIVACY_URL ? <Button variant="secondary" label="Privacy policy" onPress={() => Linking.openURL(PRIVACY_URL)} /> : null}
        {SUPPORT_EMAIL ? (
          <Button variant="secondary" label="Contact support" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
        ) : null}
        <Button variant="secondary" label="Sign out" onPress={() => supabase.auth.signOut()} />
        <Button variant="danger" label="Delete account" onPress={confirmDelete} loading={deleting} />
      </View>

      <Text style={styles.version}>GymStreak {Constants.expoConfig?.version ?? ''}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.md, paddingBottom: space.xl * 2 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { color: colors.text, fontSize: 20, fontWeight: '800' },
  sub: { color: colors.textMuted, fontSize: 15 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  times: { flexDirection: 'row', gap: space.sm },
  time: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, alignItems: 'center' },
  timeOn: { backgroundColor: colors.accent },
  timeLabel: { color: colors.text, fontWeight: '700' },
  version: { color: colors.textMuted, textAlign: 'center', marginTop: space.xl, fontSize: 12 },
});

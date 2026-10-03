import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GoalPicker } from '@/components/GoalPicker';
import { Body, Button, Field, SectionLabel, Title } from '@/components/ui';
import { normalizeUsername, upsertProfile, USERNAME_RULE } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/lib/theme';

export default function Onboarding() {
  const { session, setProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [goal, setGoal] = useState(3);
  const [busy, setBusy] = useState(false);

  async function save() {
    const handle = normalizeUsername(username);
    if (!displayName.trim()) return Alert.alert('Add your name');
    if (!USERNAME_RULE.test(handle)) {
      return Alert.alert('Pick another username', '3–20 characters: lowercase letters, numbers and underscores.');
    }
    if (!session) return;
    setBusy(true);
    try {
      setProfile(
        await upsertProfile(session.user.id, { username: handle, display_name: displayName.trim(), weekly_goal: goal }),
      );
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Title>Set up your profile</Title>
          <Body muted>Friends find you by your username.</Body>

          <SectionLabel>Name</SectionLabel>
          <Field placeholder="Alex Johnson" value={displayName} onChangeText={setDisplayName} maxLength={40} />

          <SectionLabel>Username</SectionLabel>
          <Field
            placeholder="alexlifts"
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={(t) => setUsername(normalizeUsername(t))}
            maxLength={20}
          />

          <SectionLabel>Weekly goal</SectionLabel>
          <Body muted style={{ marginBottom: space.sm }}>
            How many gym days a week? Hit it every week to grow your streak — rest days don’t break it.
          </Body>
          <GoalPicker value={goal} onChange={setGoal} />

          <Button label="Let's go" onPress={save} loading={busy} style={{ marginTop: space.xl }} />
          <Button variant="ghost" label="Sign out" onPress={() => supabase.auth.signOut()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: space.lg, gap: space.xs },
});

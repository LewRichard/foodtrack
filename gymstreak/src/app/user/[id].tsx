import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { History } from '@/components/History';
import { Avatar, Centered, EmptyState } from '@/components/ui';
import { getProfile, type Profile } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { colors, space } from '@/lib/theme';

/** A friend's (or your own) streak and photo history. Row level security hides non-friends' photos. */
export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const [profile, setProfile] = useState<Profile | null | undefined>(id === me.id ? me : undefined);

  useEffect(() => {
    if (id === me.id) return;
    getProfile(id)
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [id, me.id]);

  if (profile === undefined) return <Centered />;
  if (profile === null) return <EmptyState emoji="🫥" title="User not found" body="This account no longer exists." />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: profile.display_name }} />
      <History
        userId={profile.id}
        goal={profile.weekly_goal}
        header={
          <View style={styles.header}>
            <Avatar name={profile.display_name} size={64} />
            <Text style={styles.name}>{profile.display_name}</Text>
            <Text style={styles.sub}>
              @{profile.username} · goal {profile.weekly_goal}× a week
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 4, marginBottom: space.lg },
  name: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: space.sm },
  sub: { color: colors.textMuted, fontSize: 14 },
});

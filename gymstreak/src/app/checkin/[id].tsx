import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Photo } from '@/components/Photo';
import { ReactionBar } from '@/components/ReactionBar';
import { Avatar, Body, Button, Centered, EmptyState } from '@/components/ui';
import { blockUser, deleteCheckin, fetchCheckin, reportCheckin, type Checkin } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { formatDay, formatWhen } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';

const REPORT_REASONS = ['Nudity or sexual content', 'Harassment or bullying', 'Violence', 'Spam', 'Something else'];

export default function CheckinDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const [checkin, setCheckin] = useState<Checkin | null | undefined>(undefined);

  useEffect(() => {
    fetchCheckin(id)
      .then(setCheckin)
      .catch(() => setCheckin(null));
  }, [id]);

  if (checkin === undefined) return <Centered />;
  if (checkin === null) {
    return <EmptyState emoji="🫥" title="Not available" body="This check-in was deleted or you no longer have access." />;
  }

  const mine = checkin.user_id === me.id;

  function remove() {
    if (!checkin) return;
    Alert.alert('Delete this check-in?', 'The photo is removed for you and your friends.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCheckin(checkin);
            router.back();
          } catch (e) {
            Alert.alert('Could not delete', (e as Error).message);
          }
        },
      },
    ]);
  }

  function report() {
    if (!checkin) return;
    Alert.alert('Report this photo', 'Why are you reporting it?', [
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: async () => {
          try {
            await reportCheckin(me.id, checkin, reason);
            Alert.alert('Thanks for reporting', 'We review reports within 24 hours. You can also block this person.', [
              { text: 'OK' },
              { text: 'Block', style: 'destructive' as const, onPress: block },
            ]);
          } catch (e) {
            Alert.alert('Could not send report', (e as Error).message);
          }
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function block() {
    if (!checkin) return;
    Alert.alert(`Block ${checkin.profile.display_name}?`, 'You’ll be unfriended and they can’t send you requests.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(checkin.user_id);
            router.back();
          } catch (e) {
            Alert.alert('Could not block', (e as Error).message);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: formatDay(checkin.checkin_date) }} />
      <Pressable style={styles.header} onPress={() => router.push(`/user/${checkin.user_id}`)}>
        <Avatar name={checkin.profile.display_name} />
        <View>
          <Text style={styles.name}>{mine ? 'You' : checkin.profile.display_name}</Text>
          <Text style={styles.sub}>{formatWhen(checkin.created_at)}</Text>
        </View>
      </Pressable>
      <Photo path={checkin.photo_path} style={styles.photo} />
      {checkin.caption ? <Body style={{ marginTop: space.md }}>{checkin.caption}</Body> : null}
      <ReactionBar checkin={checkin} me={me.id} onChange={setCheckin} />

      <View style={styles.actions}>
        {mine ? (
          <Button variant="danger" label="Delete check-in" onPress={remove} />
        ) : (
          <>
            <Button variant="secondary" label="Report" onPress={report} />
            <Button variant="danger" label={`Block ${checkin.profile.display_name}`} onPress={block} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.md, paddingBottom: space.xl * 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  sub: { color: colors.textMuted, fontSize: 13 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: radius.lg },
  actions: { gap: space.sm, marginTop: space.xl },
});

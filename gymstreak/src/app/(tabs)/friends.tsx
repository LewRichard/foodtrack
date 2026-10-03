import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Avatar, Body, Button, Card, Field, SectionLabel } from '@/components/ui';
import {
  acceptFriendRequest,
  fetchCheckinDays,
  fetchFriendships,
  otherPerson,
  removeFriendship,
  searchUsers,
  sendFriendRequest,
  type Friendship,
  type PublicProfile,
} from '@/lib/api';
import { useMe } from '@/lib/auth';
import { daysPerWeek, toDayKey, weekStart, weeklyStreak, weeklyStreakFor, type DayKey } from '@/lib/streaks';
import { colors, space } from '@/lib/theme';

export default function Friends() {
  const me = useMe();
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [days, setDays] = useState<Map<string, DayKey[]>>(new Map());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await fetchFriendships();
      setFriendships(all);
      const friendIds = all.filter((f) => f.status === 'accepted').map((f) => otherPerson(f, me.id).id);
      setDays(await fetchCheckinDays([me.id, ...friendIds]));
    } catch (e) {
      Alert.alert('Could not load friends', (e as Error).message);
    }
  }, [me.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Debounced username search.
  useEffect(() => {
    const handle = setTimeout(() => {
      searchUsers(query, me.id)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, me.id]);

  const accepted = friendships.filter((f) => f.status === 'accepted');
  const incoming = friendships.filter((f) => f.status === 'pending' && f.addressee_id === me.id);
  const outgoing = friendships.filter((f) => f.status === 'pending' && f.requester_id === me.id);
  const relation = new Map(friendships.map((f) => [otherPerson(f, me.id).id, f]));
  const today = toDayKey(new Date());
  const myDays = days.get(me.id) ?? [];

  async function run(action: () => Promise<void>) {
    try {
      await action();
      await load();
    } catch (e) {
      Alert.alert('Something went wrong', (e as Error).message);
    }
  }

  function confirmRemove(f: Friendship) {
    const other = otherPerson(f, me.id);
    Alert.alert(`Remove ${other.display_name}?`, 'You will stop seeing each other’s check-ins.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(() => removeFriendship(f.id)) },
    ]);
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          tintColor={colors.accent}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Field
        placeholder="Find friends by username"
        autoCapitalize="none"
        autoCorrect={false}
        value={query}
        onChangeText={setQuery}
        clearButtonMode="while-editing"
      />
      {results.map((p) => {
        const existing = relation.get(p.id);
        return (
          <Row key={p.id} profile={p}>
            {existing ? (
              <Body muted>{existing.status === 'accepted' ? 'Friends' : 'Pending'}</Body>
            ) : (
              <Button small label="Add" onPress={() => run(() => sendFriendRequest(me.id, p.id))} />
            )}
          </Row>
        );
      })}

      <Button
        variant="secondary"
        label="Invite a friend"
        style={{ marginTop: space.md }}
        onPress={() =>
          Share.share({
            message: `Keep me accountable at the gym! Add me on GymStreak — my username is @${me.username}`,
          })
        }
      />

      {incoming.length > 0 ? <SectionLabel>Friend requests</SectionLabel> : null}
      {incoming.map((f) => (
        <Row key={f.id} profile={f.requester}>
          <View style={styles.actions}>
            <Button small label="Accept" onPress={() => run(() => acceptFriendRequest(f.id))} />
            <Button small variant="secondary" label="Decline" onPress={() => run(() => removeFriendship(f.id))} />
          </View>
        </Row>
      ))}

      <SectionLabel>{`Friends (${accepted.length})`}</SectionLabel>
      {accepted.length === 0 ? (
        <Body muted>Add friends to see their gym check-ins and build streaks together.</Body>
      ) : null}
      {accepted.map((f) => {
        const friend = otherPerson(f, me.id);
        const theirDays = days.get(friend.id) ?? [];
        const together = weeklyStreakFor([myDays, theirDays], [me.weekly_goal, friend.weekly_goal], today);
        const theirStreak = weeklyStreak(theirDays, friend.weekly_goal, today);
        const thisWeek = daysPerWeek(theirDays).get(weekStart(today)) ?? 0;
        return (
          <Pressable key={f.id} onPress={() => router.push(`/user/${friend.id}`)} onLongPress={() => confirmRemove(f)}>
            <Card style={styles.friendCard}>
              <Avatar name={friend.display_name} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{friend.display_name}</Text>
                <Text style={styles.sub}>
                  🔥 {theirStreak}w · {thisWeek}/{friend.weekly_goal} this week
                </Text>
              </View>
              <View style={styles.together}>
                <Text style={styles.togetherValue}>🤝 {together}</Text>
                <Text style={styles.sub}>weeks together</Text>
              </View>
            </Card>
          </Pressable>
        );
      })}
      {accepted.length > 0 ? <Body muted style={styles.hint}>Long-press a friend to remove them.</Body> : null}

      {outgoing.length > 0 ? <SectionLabel>Sent requests</SectionLabel> : null}
      {outgoing.map((f) => (
        <Row key={f.id} profile={f.addressee}>
          <Button small variant="secondary" label="Cancel" onPress={() => run(() => removeFriendship(f.id))} />
        </Row>
      ))}
    </ScrollView>
  );
}

function Row({ profile, children }: { profile: PublicProfile; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Avatar name={profile.display_name} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{profile.display_name}</Text>
        <Text style={styles.sub}>@{profile.username}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.md, paddingBottom: space.xl * 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  actions: { flexDirection: 'row', gap: space.sm },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 13 },
  friendCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  together: { alignItems: 'flex-end' },
  togetherValue: { color: colors.accent, fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 13, textAlign: 'center', marginTop: space.xs },
});

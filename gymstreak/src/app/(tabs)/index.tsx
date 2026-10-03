import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { CheckinCard } from '@/components/CheckinCard';
import { StreakCard } from '@/components/StreakCard';
import { Button, EmptyState } from '@/components/ui';
import { fetchCheckinDays, fetchFeed, type Checkin } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { scheduleReminders } from '@/lib/reminders';
import { summarize, toDayKey, type StreakSummary } from '@/lib/streaks';
import { colors, space } from '@/lib/theme';

const PAGE = 20;

export default function Feed() {
  const me = useMe();
  const [items, setItems] = useState<Checkin[] | null>(null);
  const [summary, setSummary] = useState<StreakSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [feed, days] = await Promise.all([fetchFeed(PAGE), fetchCheckinDays([me.id])]);
      const s = summarize(days.get(me.id) ?? [], me.weekly_goal, toDayKey(new Date()));
      setItems(feed);
      setHasMore(feed.length === PAGE);
      setSummary(s);
      setError(null);
      scheduleReminders({ checkedInToday: s.checkedInToday, streakWeeks: s.weekStreak }).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    }
  }, [me.id, me.weekly_goal]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function loadMore() {
    if (!items || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const older = await fetchFeed(PAGE, items[items.length - 1]?.created_at);
      setItems([...items, ...older]);
      setHasMore(older.length === PAGE);
    } catch {
      // Leave hasMore as-is so scrolling retries.
    } finally {
      setLoadingMore(false);
    }
  }

  const update = (next: Checkin) => setItems((prev) => prev?.map((c) => (c.id === next.id ? next : c)) ?? null);

  return (
    <View style={styles.screen}>
      <FlatList
        data={items ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <CheckinCard checkin={item} me={me.id} onChange={update} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
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
        ListHeaderComponent={
          <View style={styles.header}>
            {summary ? <StreakCard summary={summary} /> : null}
            <Button
              label={summary?.checkedInToday ? '📸  Post another check-in' : '📸  Check in at the gym'}
              onPress={() => router.push('/capture')}
            />
          </View>
        }
        ListEmptyComponent={
          items === null ? (
            error ? (
              <EmptyState emoji="⚠️" title="Couldn't load your feed" body={error} />
            ) : (
              <ActivityIndicator color={colors.accent} style={{ marginTop: space.xl }} />
            )
          ) : (
            <EmptyState
              emoji="👋"
              title="Your feed is empty"
              body="Post your first check-in and add friends — their gym photos show up here."
            />
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accent} /> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.md, paddingBottom: space.xl * 2 },
  header: { gap: space.md, marginBottom: space.lg },
});

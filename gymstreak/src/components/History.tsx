import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchUserCheckins, type Checkin } from '@/lib/api';
import { formatMonth } from '@/lib/format';
import { addMonths, monthGrid, summarize, toDayKey } from '@/lib/streaks';
import { colors, radius, space } from '@/lib/theme';
import { Photo } from './Photo';
import { StreakCard } from './StreakCard';
import { Body, Centered, EmptyState, SectionLabel } from './ui';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** A user's streak stats plus a month-by-month calendar of every check-in photo. */
export function History({ userId, goal, header }: { userId: string; goal: number; header?: ReactNode }) {
  const [checkins, setCheckins] = useState<Checkin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const today = toDayKey(new Date());
  const [month, setMonth] = useState(today.slice(0, 8) + '01');

  const load = useCallback(async () => {
    try {
      setCheckins(await fetchUserCheckins(userId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Checkin[]>();
    for (const c of checkins ?? []) map.set(c.checkin_date, [...(map.get(c.checkin_date) ?? []), c]);
    return map;
  }, [checkins]);

  if (!checkins) return error ? <EmptyState emoji="⚠️" title="Couldn't load history" body={error} /> : <Centered />;

  const summary = summarize([...byDay.keys()], goal, today);
  const grid = monthGrid(month);
  const monthPrefix = month.slice(0, 7);
  const monthCheckins = checkins.filter((c) => c.checkin_date.startsWith(monthPrefix));
  const firstMonth = checkins.length ? checkins[checkins.length - 1].checkin_date.slice(0, 8) + '01' : month;
  const canGoBack = month > firstMonth;
  const canGoForward = month < today.slice(0, 8) + '01';

  return (
    <ScrollView
      contentContainerStyle={styles.container}
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
      {header}
      <StreakCard summary={summary} />
      <View style={styles.stats}>
        <Stat label="Gym days" value={summary.totalDays} />
        <Stat label="Best day streak" value={summary.longestDayStreak} />
        <Stat label="Photos" value={checkins.length} />
      </View>

      <View style={styles.monthHeader}>
        <Pressable disabled={!canGoBack} onPress={() => setMonth(addMonths(month, -1))} hitSlop={12}>
          <Text style={[styles.arrow, !canGoBack && styles.disabled]}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>{formatMonth(month)}</Text>
        <Pressable disabled={!canGoForward} onPress={() => setMonth(addMonths(month, 1))} hitSlop={12}>
          <Text style={[styles.arrow, !canGoForward && styles.disabled]}>›</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.weekday}>
            {d}
          </Text>
        ))}
        {grid.map((day) => {
          const inMonth = day.startsWith(monthPrefix);
          const latest = byDay.get(day)?.[0];
          return (
            <Pressable
              key={day}
              style={styles.cell}
              disabled={!latest}
              onPress={() => latest && router.push(`/checkin/${latest.id}`)}
            >
              {latest && inMonth ? (
                <Photo path={latest.photo_path} style={styles.cellPhoto} />
              ) : (
                <View style={[styles.cellPhoto, styles.cellEmpty, day === today && styles.cellToday]} />
              )}
              <Text style={[styles.cellLabel, !inMonth && styles.disabled, latest && inMonth && styles.cellLabelOnPhoto]}>
                {Number(day.slice(8))}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SectionLabel>{`${monthCheckins.length} photo${monthCheckins.length === 1 ? '' : 's'} in ${formatMonth(month)}`}</SectionLabel>
      {monthCheckins.length === 0 ? (
        <Body muted>No check-ins this month.</Body>
      ) : (
        <View style={styles.gallery}>
          {monthCheckins.map((c) => (
            <Pressable key={c.id} style={styles.galleryItem} onPress={() => router.push(`/checkin/${c.id}`)}>
              <Photo path={c.photo_path} style={styles.galleryPhoto} />
              <Text style={styles.galleryDate}>{Number(c.checkin_date.slice(8))}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.md, paddingBottom: space.xl * 2 },
  stats: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: 12, marginTop: 2, textAlign: 'center' },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  monthTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  arrow: { color: colors.accent, fontSize: 32, paddingHorizontal: space.sm },
  disabled: { opacity: 0.3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  cellPhoto: { flex: 1, borderRadius: radius.sm },
  cellEmpty: { backgroundColor: colors.surface },
  cellToday: { borderColor: colors.accent, borderWidth: 1.5 },
  cellLabel: { position: 'absolute', top: 5, left: 7, color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  cellLabelOnPhoto: { color: '#fff', textShadowColor: '#000', textShadowRadius: 3 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -2 },
  galleryItem: { width: '33.333%', aspectRatio: 1, padding: 2 },
  galleryPhoto: { flex: 1, borderRadius: radius.sm },
  galleryDate: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    color: '#fff',
    fontWeight: '700',
    textShadowColor: '#000',
    textShadowRadius: 3,
  },
});

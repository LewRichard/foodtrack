import { StyleSheet, Text, View } from 'react-native';
import type { StreakSummary } from '@/lib/streaks';
import { colors, radius, space } from '@/lib/theme';

export function StreakCard({ summary }: { summary: StreakSummary }) {
  const { weekStreak, dayStreak, thisWeekCount, goal, checkedInToday } = summary;
  const remaining = Math.max(0, goal - thisWeekCount);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.flame}>🔥</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.big}>
            {weekStreak} week{weekStreak === 1 ? '' : 's'}
          </Text>
          <Text style={styles.muted}>
            {remaining === 0
              ? 'Weekly goal hit — nice work!'
              : `${remaining} more gym day${remaining === 1 ? '' : 's'} to keep the streak this week`}
          </Text>
        </View>
      </View>
      <View style={styles.dots}>
        {Array.from({ length: goal }, (_, i) => (
          <View key={i} style={[styles.dot, i < thisWeekCount && styles.dotOn]} />
        ))}
        <Text style={styles.count}>
          {thisWeekCount}/{goal} this week
        </Text>
      </View>
      <Text style={styles.muted}>
        {checkedInToday ? '✅ Checked in today' : 'Not checked in today'} · {dayStreak}-day streak
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flame: { fontSize: 40 },
  big: { color: colors.text, fontSize: 26, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 14 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 22, height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised },
  dotOn: { backgroundColor: colors.accent },
  count: { color: colors.text, fontSize: 13, fontWeight: '600', marginLeft: space.xs },
});

import * as Haptics from 'expo-haptics';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { REACTIONS, setReaction, type Checkin } from '@/lib/api';
import { colors, radius, space } from '@/lib/theme';

export function ReactionBar({ checkin, me, onChange }: { checkin: Checkin; me: string; onChange: (next: Checkin) => void }) {
  const mine = checkin.reactions.find((r) => r.user_id === me)?.emoji ?? null;
  const counts = new Map<string, number>();
  for (const r of checkin.reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);

  async function toggle(emoji: string) {
    const next = mine === emoji ? null : emoji;
    const previous = checkin;
    const others = checkin.reactions.filter((r) => r.user_id !== me);
    onChange({ ...checkin, reactions: next ? [...others, { user_id: me, emoji: next }] : others });
    Haptics.selectionAsync().catch(() => {});
    try {
      await setReaction(checkin.id, me, next);
    } catch (e) {
      onChange(previous);
      Alert.alert('Could not react', (e as Error).message);
    }
  }

  return (
    <View style={styles.row}>
      {REACTIONS.map((emoji) => {
        const count = counts.get(emoji) ?? 0;
        return (
          <Pressable
            key={emoji}
            accessibilityLabel={`React ${emoji}`}
            onPress={() => toggle(emoji)}
            style={[styles.chip, mine === emoji && styles.chipOn]}
          >
            <Text style={styles.emoji}>{emoji}</Text>
            {count > 0 ? <Text style={styles.count}>{count}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent, borderWidth: 1 },
  emoji: { fontSize: 18 },
  count: { color: colors.text, fontWeight: '700', fontSize: 13 },
});

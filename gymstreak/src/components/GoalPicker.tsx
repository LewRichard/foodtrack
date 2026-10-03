import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/lib/theme';

export function GoalPicker({ value, onChange }: { value: number; onChange: (goal: number) => void }) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
        <Pressable
          key={n}
          accessibilityLabel={`${n} days per week`}
          accessibilityState={{ selected: n === value }}
          onPress={() => onChange(n)}
          style={[styles.option, n === value && styles.selected]}
        >
          <Text style={[styles.label, n === value && styles.selectedLabel]}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  option: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.accent },
  label: { color: colors.text, fontWeight: '700', fontSize: 16 },
  selectedLabel: { color: colors.accentText },
});

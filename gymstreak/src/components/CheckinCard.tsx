import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Checkin } from '@/lib/api';
import { formatWhen } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';
import { Photo } from './Photo';
import { ReactionBar } from './ReactionBar';
import { Avatar } from './ui';

export function CheckinCard({
  checkin,
  me,
  onChange,
}: {
  checkin: Checkin;
  me: string;
  onChange: (next: Checkin) => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => router.push(`/user/${checkin.user_id}`)}>
        <Avatar name={checkin.profile.display_name} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{checkin.user_id === me ? 'You' : checkin.profile.display_name}</Text>
          <Text style={styles.when}>{formatWhen(checkin.created_at)}</Text>
        </View>
      </Pressable>
      <Pressable onPress={() => router.push(`/checkin/${checkin.id}`)}>
        <Photo path={checkin.photo_path} style={styles.photo} />
        {checkin.caption ? (
          <View style={styles.captionWrap}>
            <Text style={styles.caption}>{checkin.caption}</Text>
          </View>
        ) : null}
      </Pressable>
      <ReactionBar checkin={checkin} me={me} onChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  name: { color: colors.text, fontWeight: '700', fontSize: 15 },
  when: { color: colors.textMuted, fontSize: 13 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: radius.lg },
  captionWrap: {
    position: 'absolute',
    bottom: space.md,
    alignSelf: 'center',
    maxWidth: '85%',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  caption: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
});

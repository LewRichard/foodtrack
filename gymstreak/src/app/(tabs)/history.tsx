import { View } from 'react-native';
import { History } from '@/components/History';
import { useMe } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function MyHistory() {
  const me = useMe();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <History userId={me.id} goal={me.weekly_goal} />
    </View>
  );
}

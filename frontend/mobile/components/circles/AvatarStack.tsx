import { StyleSheet, Text, View } from 'react-native';

import { PersonAvatar } from '@/components/friends/PersonAvatar';
import type { UserLite } from '@/lib/types';
import { colors, type as typeScale } from '@/lib/theme';

/** Overlapping member avatars, with "+3" when there are more than `max`. */
export function AvatarStack({ users, size = 28, max = 5 }: { users: UserLite[]; size?: number; max?: number }) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={users.map((u) => u.first_name).join(', ') || 'No members'}
    >
      {shown.map((u, i) => (
        <View
          key={u.id}
          style={[styles.ring, { marginLeft: i === 0 ? 0 : -size / 3, borderRadius: (size + 4) / 2 }]}
        >
          <PersonAvatar user={u} size={size} />
        </View>
      ))}
      {extra > 0 ? <Text style={styles.extra}>+{extra}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  ring: { borderWidth: 2, borderColor: colors.white, backgroundColor: colors.white },
  extra: { ...typeScale.meta, marginLeft: 6 },
});

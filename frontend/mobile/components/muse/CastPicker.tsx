import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { toUser } from '@/lib/people';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { UserLite } from '@/lib/types';

export type CastPickerProps = {
  users: UserLite[];
  loading: boolean;
  error: string | null;
  pickedId: string | null;
  onPick: (id: string) => void;
  onRetry: () => void;
};

/** Horizontal strip of the seeded cast; the picked person acts in the People buttons. */
export function CastPicker({ users, loading, error, pickedId, onPick, onRetry }: CastPickerProps) {
  if (loading && !users.length) return <ActivityIndicator style={styles.status} color={colors.textSecondary} />;
  if (error && !users.length) {
    return (
      <Pressable onPress={onRetry} style={styles.status} accessibilityRole="button">
        <Text style={styles.message}>{error} · Tap to retry</Text>
      </Pressable>
    );
  }
  if (!users.length) return <Text style={[styles.message, styles.status]}>No other people on this server yet</Text>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {users.map((u) => {
        const picked = u.id === pickedId;
        return (
          <Pressable
            key={u.id}
            onPress={() => onPick(u.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: picked }}
            accessibilityLabel={u.name}
            style={[styles.person, picked && styles.picked]}
          >
            <Avatar source={toUser(u).avatar} size={44} />
            <Text style={[styles.name, picked && styles.pickedName]} numberOfLines={1}>
              {u.first_name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { gap: spacing.xs, paddingVertical: spacing.xs },
  person: { alignItems: 'center', width: 72, padding: spacing.xs, borderRadius: radius.md, gap: spacing.xs },
  picked: { backgroundColor: colors.chipSelectedBg },
  name: { ...typeScale.meta, color: colors.text },
  pickedName: { color: colors.chipSelectedText, fontWeight: '600' },
  status: { paddingVertical: spacing.md },
  message: { ...typeScale.meta },
});

export default CastPicker;

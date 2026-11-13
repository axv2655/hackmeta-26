import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Icon } from '@/components/ui/Icon';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Move } from '@/lib/types';

import { MomentImage } from './MomentImage';
import { useMoments } from './useMoments';

const THUMBS = 4;

/** Moments count and a strip of thumbnails; opens the Moments screen. */
export function MomentsRow({ move }: { move: Move }) {
  const router = useRouter();
  const { items, status } = useMoments(move.id, move.moments_count > 0);
  const count = Math.max(move.moments_count, items.length);
  const label = count === 0 ? 'No Moments yet' : `${count} ${count === 1 ? 'Moment' : 'Moments'}`;

  return (
    <Pressable
      style={styles.wrap}
      onPress={() => router.push(`/move/${move.id}/moments`)}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Open Moments`}
    >
      <View style={styles.head}>
        <Icon name="images" size={20} color={colors.text} />
        <Text style={[typeScale.name, styles.flex]}>Moments</Text>
        <Text style={typeScale.meta}>{label}</Text>
        <Icon name="chevron-right" size={18} color={colors.textSecondary} />
      </View>
      {count > 0 && status === 'ready' && items.length > 0 ? (
        <View style={styles.thumbs}>
          {items.slice(0, THUMBS).map((m) => (
            <MomentImage key={m.id} moment={m} style={styles.thumb} />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  thumbs: { flexDirection: 'row', gap: spacing.xs },
  thumb: { width: 64, height: 64, borderRadius: radius.sm },
});

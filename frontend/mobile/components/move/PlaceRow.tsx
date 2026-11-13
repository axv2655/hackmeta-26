import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Icon } from '@/components/ui/Icon';
import { useSaved } from '@/lib/saved';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Mark } from '@/lib/types';

/** The Mark this Move is at: opens the Mark, with a Save place toggle. */
export function PlaceRow({ mark }: { mark: Mark }) {
  const router = useRouter();
  const saved = useSaved((s) => Boolean(s.ids[mark.id]) || (!s.loaded && mark.saved));
  const toggle = useSaved((s) => s.toggle);

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.place}
        onPress={() => router.push(`/mark/${mark.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${mark.name}`}
      >
        <View style={styles.pin}>
          <Icon name="map-pin" size={20} color={colors.blue} />
        </View>
        <View style={styles.text}>
          <View style={styles.nameRow}>
            <Text style={typeScale.name} numberOfLines={1}>
              {mark.name}
            </Text>
            {mark.score != null ? (
              <View style={styles.score} accessibilityLabel={`Rated ${mark.score.toFixed(1)} out of 10`}>
                <Text style={styles.scoreText}>{mark.score.toFixed(1)}</Text>
              </View>
            ) : null}
          </View>
          {mark.address ? (
            <Text style={typeScale.meta} numberOfLines={1}>
              {mark.address}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-right" size={18} color={colors.textSecondary} />
      </Pressable>
      <Pressable
        style={[styles.save, saved && styles.saveOn]}
        onPress={() => void toggle(mark.id)}
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={saved ? 'Saved Mark. Tap to unsave' : 'Save place'}
      >
        <Icon name="bookmark" size={16} color={saved ? colors.blue : colors.text} />
        <Text style={[styles.saveText, saved && { color: colors.blue }]}>{saved ? 'Saved' : 'Save place'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: spacing.lg, gap: spacing.sm },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  score: { backgroundColor: colors.online, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1 },
  scoreText: { ...typeScale.label, fontSize: 12, color: colors.white },
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.buttonSecondary,
  },
  saveOn: { backgroundColor: colors.chipSelectedBg },
  saveText: { ...typeScale.label },
});

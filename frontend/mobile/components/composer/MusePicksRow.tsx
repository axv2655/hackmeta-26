import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MuseBadge } from '@/components/common/MuseBadge';
import { ReasonLine } from '@/components/common/ReasonLine';
import { PressableScale } from '@/components/ui/PressableScale';
import { museSpots, toPlace, type Place } from '@/lib/composer';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Category } from '@/lib/types';

import { section } from './Chip';
import { useDebouncedQuery } from './hooks';

type Props = { userIds: string[]; category: Category; onPick: (p: Place) => void };

/**
 * "Muse picks": 3 spots for you and the people you chose, each with Muse's
 * reason. Suggest-spots does not say whether the model answered, so the badge
 * follows `/muse/status`.
 */
export function MusePicksRow({ userIds, category, onPick }: Props) {
  const key = `${category}:${[...userIds].sort().join(',')}`;
  const spots = useDebouncedQuery(key, () => museSpots(userIds, category), true, 400);
  const rows = spots.data ?? [];

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{userIds.length ? 'Muse picks for your group' : 'Muse picks'}</Text>
        <MuseBadge />
        {spots.loading ? <ActivityIndicator size="small" /> : null}
      </View>
      {spots.error ? (
        <PressableScale onPress={spots.retry} accessibilityRole="button">
          <Text style={section.error}>Couldn't get Muse's picks · Tap to retry</Text>
        </PressableScale>
      ) : null}
      {!spots.loading && !spots.error && rows.length === 0 ? (
        <Text style={section.meta}>No picks for this yet.</Text>
      ) : null}
      {rows.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={section.chipRow}>
          {rows.map((s) => (
            <PressableScale
              key={s.mark.id}
              onPress={() => onPick(toPlace(s.mark))}
              style={styles.card}
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityLabel={`${s.mark.name}. ${s.reason}`}
            >
              <Text style={styles.name} numberOfLines={1}>
                {s.mark.name}
              </Text>
              <ReasonLine text={s.reason} />
            </PressableScale>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, marginTop: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typeScale.label, color: colors.textSecondary },
  card: {
    width: 200,
    gap: 2,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  name: { ...typeScale.name, fontSize: 15 },
});

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { categoryMeta } from '@/lib/categories';
import { toUser } from '@/lib/people';
import { scoreText } from '@/lib/ratings';
import { colors, layout, spacing, type as typeScale } from '@/lib/theme';
import type { LeaderboardSpot, MuseMark, MyListRow } from '@/lib/types';

import { MarkThumb } from './MarkThumb';
import { ScoreBadge } from './ScoreBadge';

/** "you 8.4 · friends 7.9", leaving out whichever side has no score. */
export function splitLine(spot: LeaderboardSpot): string | null {
  const parts = [
    spot.your_score != null ? `you ${scoreText(spot.your_score)}` : null,
    spot.friends_score != null ? `friends ${scoreText(spot.friends_score)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function Shell({
  position,
  mark,
  onPress,
  children,
  score,
}: {
  position: number;
  mark: MuseMark;
  onPress: () => void;
  children?: ReactNode;
  score: number;
}) {
  const meta = categoryMeta(mark.category);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${position}. ${mark.name}, score ${scoreText(score)}`}
    >
      <Text style={styles.pos}>{position}</Text>
      <MarkThumb mark={mark} />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {mark.name}
          </Text>
          <Icon name={meta.icon} size={14} color={meta.color} />
        </View>
        {children}
      </View>
      <ScoreBadge score={score} />
    </Pressable>
  );
}

export function SpotRow({ spot, onPress }: { spot: LeaderboardSpot; onPress: () => void }) {
  const line = splitLine(spot);
  return (
    <Shell position={spot.position} mark={spot.mark} score={spot.score} onPress={onPress}>
      <View style={styles.metaRow}>
        {spot.rankers.length > 0 ? (
          <View style={styles.faces}>
            {spot.rankers.slice(0, 3).map((u, i) => (
              <Avatar
                key={u.id}
                source={toUser(u).avatar}
                size={18}
                style={i > 0 ? styles.overlap : undefined}
                accessibilityLabel={u.name}
              />
            ))}
          </View>
        ) : null}
        {line ? (
          <Text style={styles.meta} numberOfLines={1}>
            {line}
          </Text>
        ) : null}
      </View>
    </Shell>
  );
}

export function MyRow({ row, onPress }: { row: MyListRow; onPress: () => void }) {
  return (
    <Shell position={row.position} mark={row.mark} score={row.score} onPress={onPress}>
      <Text style={styles.meta} numberOfLines={1}>
        {categoryMeta(row.category).label}
        {row.mark.address ? ` · ${row.mark.address}` : ''}
      </Text>
    </Shell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.gutter,
    paddingVertical: spacing.sm,
  },
  pressed: { backgroundColor: colors.surface },
  pos: { ...typeScale.label, width: 22, textAlign: 'center', color: colors.textSecondary },
  body: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { ...typeScale.name, flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  faces: { flexDirection: 'row' },
  overlap: { marginLeft: -6 },
  meta: { ...typeScale.meta, flexShrink: 1 },
});

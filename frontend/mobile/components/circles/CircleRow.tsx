import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import type { Circle } from '@/lib/types';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';

import { AvatarStack } from './AvatarStack';

function memberLine(c: Circle): string {
  const n = c.members.length;
  return n === 0 ? 'No one yet' : `${n} ${n === 1 ? 'person' : 'people'}`;
}

/** A Circle in the list: emoji, name, Facebook Group tag, members. Tap to edit. */
export function CircleRow({ circle, onPress }: { circle: Circle; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} style={styles.row} accessibilityRole="button" accessibilityLabel={`${circle.name}, ${memberLine(circle)}`}>
      <View style={styles.emoji}>
        {circle.emoji ? <Text style={styles.emojiText}>{circle.emoji}</Text> : <Icon name="users" size={22} color={colors.textSecondary} />}
      </View>
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {circle.name}
          </Text>
          {circle.fb_group_name ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>Facebook Group</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.sub} numberOfLines={1}>
          {memberLine(circle)}
        </Text>
      </View>
      <AvatarStack users={circle.members} size={26} max={3} />
      <Icon name="chevron-right" size={18} color={colors.placeholder} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  emoji: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 24 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typeScale.name, flexShrink: 1 },
  tag: { backgroundColor: colors.tintBg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  tagText: { ...typeScale.label, fontSize: 11, color: colors.tintText },
  sub: { ...typeScale.meta },
});

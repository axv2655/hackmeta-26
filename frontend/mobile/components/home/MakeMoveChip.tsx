import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, layout, radius, spacing, type as typeScale } from '@/lib/theme';

export type MakeMoveChipProps = { onPress: () => void };

/** "Make a Move" under the composer bar: opens the Move composer (/move/new). */
export function MakeMoveChip({ onPress }: MakeMoveChipProps) {
  return (
    <View style={styles.row}>
      <PressableScale
        onPress={onPress}
        scaleTo={0.97}
        style={styles.chip}
        accessibilityRole="button"
        accessibilityLabel="Make a Move"
        accessibilityHint="Share what you're doing so friends can pull up"
      >
        <Icon name="moves" size={18} color={colors.chipSelectedText} filled />
        <Text style={styles.text}>Make a Move</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: layout.gutter, paddingBottom: spacing.md, backgroundColor: colors.white },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.chipSelectedBg,
  },
  text: { ...typeScale.button, color: colors.chipSelectedText },
});

export default MakeMoveChip;

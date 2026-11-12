import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { selection } from '@/lib/haptics';
import { colors, layout, radii, spacing, type as typeScale } from '@/lib/theme';

import type { NotificationFilter } from './types';

const CHIP_HEIGHT = 36;
const CHIP_SLOP = (layout.hitTarget - CHIP_HEIGHT) / 2;

const CHIPS: { value: NotificationFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
];

export type FilterChipsProps = {
  value: NotificationFilter;
  onChange: (value: NotificationFilter) => void;
};

/** "All" / "Unread" pills under the Notifications title. */
export function FilterChips({ value, onChange }: FilterChipsProps) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {CHIPS.map((chip) => {
        const active = chip.value === value;
        return (
          <PressableScale
            key={chip.value}
            onPress={() => {
              if (active) return;
              selection();
              onChange(chip.value);
            }}
            hitSlop={{ top: CHIP_SLOP, bottom: CHIP_SLOP }}
            accessibilityRole="tab"
            accessibilityLabel={`${chip.label} notifications`}
            accessibilityState={{ selected: active }}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{chip.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  chip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.grayButton,
  },
  chipActive: { backgroundColor: colors.tintBg },
  label: { ...typeScale.button },
  labelActive: { color: colors.tintText },
});

export default FilterChips;

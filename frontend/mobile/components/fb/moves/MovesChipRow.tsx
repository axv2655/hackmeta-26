import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { selection } from '@/lib/haptics';
import { colors, fontWeights, radius, spacing } from '@/lib/theme';

export const MOVES_FILTERS = ['Post', 'For you', 'Nearby', 'Circles'] as const;
export type MovesFilter = (typeof MOVES_FILTERS)[number];

export type MovesChipRowProps = {
  selected: MovesFilter;
  onSelect: (filter: MovesFilter) => void;
  /** Trailing "More" dropdown chip. */
  onPressMore?: () => void;
  style?: StyleProp<ViewStyle>;
};

const CHIP_HEIGHT = 40;

/**
 * Marketplace-style filter row: the selected chip is a light-blue capsule with blue text,
 * the others are plain text. Scrolls horizontally when it does not fit.
 */
export function MovesChipRow({ selected, onSelect, onPressMore, style }: MovesChipRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={style}
      accessibilityRole="tablist"
    >
      {MOVES_FILTERS.map((filter) => {
        const isSelected = filter === selected;
        return (
          <PressableScale
            key={filter}
            onPress={() => {
              if (!isSelected) {
                selection();
                onSelect(filter);
              }
            }}
            scaleTo={0.96}
            pressedOpacity={0.75}
            accessibilityRole="tab"
            accessibilityLabel={filter}
            accessibilityState={{ selected: isSelected }}
            style={[styles.chip, isSelected && styles.chipSelected]}
          >
            <Text style={[styles.label, isSelected && styles.labelSelected]} numberOfLines={1}>
              {filter}
            </Text>
          </PressableScale>
        );
      })}
      <PressableScale
        onPress={() => {
          selection();
          onPressMore?.();
        }}
        scaleTo={0.96}
        pressedOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="More filters"
        style={styles.chip}
      >
        <View style={styles.moreInner}>
          <Text style={styles.label}>More</Text>
          <Icon name="chevron-down" size={18} color={colors.text} />
        </View>
      </PressableScale>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.sm,
    gap: spacing.xxs,
    alignItems: 'center',
  },
  chip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.chipSelectedBg },
  label: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: fontWeights.medium,
    color: colors.text,
  },
  labelSelected: { color: colors.chipSelectedText, fontWeight: fontWeights.semibold },
  moreInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});

export default MovesChipRow;

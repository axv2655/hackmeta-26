import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, fontWeights, hairlineWidth, layout, radii, spacing } from '@/lib/theme';

import { CHIP_BACKGROUND } from './constants';

export type PlaceChipProps = {
  /** The Mark's name (or, offline, the bundled place name). */
  placeName: string;
  /** From the API; hidden when unknown. */
  distanceMi: number | null;
  /** No Mark yet: the caption names a place Muse still has to find. */
  unresolved?: boolean;
  /** Opens the place sheet. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** "1.2 mi", or "0.1 mi" for anything closer. */
export function milesLabel(distanceMi: number): string {
  return `${Math.max(0.1, distanceMi).toFixed(1)} mi`;
}

const CHIP_HEIGHT = 30;

/** "pin  Kumo Matcha · 1.2 mi" pill above a reel's caption; "Find this place" when Muse still has to resolve it. */
export function PlaceChip({ placeName, distanceMi, unresolved = false, onPress, style }: PlaceChipProps) {
  const name = unresolved ? 'Find this place' : placeName;
  const distance = !unresolved && distanceMi != null ? milesLabel(distanceMi) : null;

  return (
    <PressableScale
      onPress={onPress}
      haptic
      scaleTo={0.96}
      hitSlop={(layout.hitTarget - CHIP_HEIGHT) / 2}
      accessibilityLabel={distance ? `${name}, ${distance} away` : name}
      accessibilityHint="Shows who is there and lets you start a Move"
      style={[styles.chip, style]}
    >
      <Icon name={unresolved ? 'sparkles' : 'map-pin'} size={14} color={colors.darkText} strokeWidth={2.25} />
      <View style={styles.labelWrap}>
        <Text style={styles.label} numberOfLines={1}>
          {name}
          {distance ? <Text style={styles.distance}>{` · ${distance}`}</Text> : null}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    height: CHIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: radii.pill,
    borderWidth: hairlineWidth,
    borderColor: colors.darkHairline,
    backgroundColor: CHIP_BACKGROUND,
  },
  labelWrap: { flexShrink: 1 },
  label: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: fontWeights.semibold,
    color: colors.darkText,
  },
  distance: {
    fontWeight: fontWeights.regular,
    color: colors.darkTextSecondary,
  },
});

export default PlaceChip;

import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, fontWeights, hairlineWidth, layout, radii, spacing } from '@/lib/theme';

import { CHIP_BACKGROUND } from './constants';
import { placeDistanceLabel } from './place';

export type PlaceChipProps = {
  placeName: string;
  /** No-op for now. The Moves feature hooks in here. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const CHIP_HEIGHT = 30;

/** "pin  Kumo Matcha · 1.2 mi" pill shown above a reel's caption when it is tagged with a place. */
export function PlaceChip({ placeName, onPress, style }: PlaceChipProps) {
  const distance = placeDistanceLabel(placeName);

  return (
    <PressableScale
      onPress={onPress}
      haptic
      scaleTo={0.96}
      hitSlop={(layout.hitTarget - CHIP_HEIGHT) / 2}
      accessibilityLabel={`${placeName}, ${distance} away`}
      style={[styles.chip, style]}
    >
      <Icon name="map-pin" size={14} color={colors.darkText} strokeWidth={2.25} />
      <View style={styles.labelWrap}>
        <Text style={styles.label} numberOfLines={1}>
          {placeName}
          <Text style={styles.distance}>{` · ${distance}`}</Text>
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

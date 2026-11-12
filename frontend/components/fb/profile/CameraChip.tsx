import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, hitSlopFor } from '@/lib/theme';

export type CameraChipProps = {
  accessibilityLabel: string;
  onPress?: () => void;
  /** Circle diameter. Default 36. */
  size?: number;
  /** White ring so the chip reads on top of a photo edge. Default true. */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Gray circle with a camera glyph: "change photo" affordance on the cover and the profile picture. */
export function CameraChip({ accessibilityLabel, onPress, size = 36, ring = true, style }: CameraChipProps) {
  return (
    <PressableScale
      onPress={onPress}
      haptic
      scaleTo={0.92}
      pressedOpacity={0.8}
      hitSlop={hitSlopFor(size)}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.chip,
        { width: size, height: size, borderRadius: size / 2 },
        ring && styles.ring,
        style,
      ]}
    >
      <Icon name="camera" size={Math.round(size * 0.53)} color={colors.text} strokeWidth={2.2} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.grayButton,
  },
  ring: { borderWidth: 2, borderColor: colors.white },
});

export default CameraChip;

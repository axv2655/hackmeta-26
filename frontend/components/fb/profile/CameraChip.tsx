import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, hitSlopFor, shadows } from '@/lib/theme';

export type CameraChipProps = {
  accessibilityLabel: string;
  onPress?: () => void;
  /** Circle diameter (or glyph box for the 'glyph' variant). Default 36. */
  size?: number;
  /**
   * 'chip'  : light-gray circle with a black filled camera (profile picture).
   * 'glyph' : bare white filled camera with a soft shadow (cover / gradient area).
   */
  variant?: 'chip' | 'glyph';
  /** White ring so the chip reads on top of a photo edge. Default true. Chip variant only. */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** "Change photo" affordance on the cover area and the profile picture (SF Symbol camera.fill). */
export function CameraChip({
  accessibilityLabel,
  onPress,
  size = 36,
  variant = 'chip',
  ring = true,
  style,
}: CameraChipProps) {
  const glyph = variant === 'glyph';
  const glyphSize = glyph ? Math.round(size * 0.8) : Math.round(size * 0.55);
  const tint = glyph ? colors.white : colors.text;

  return (
    <PressableScale
      onPress={onPress}
      haptic
      scaleTo={0.92}
      pressedOpacity={0.8}
      hitSlop={hitSlopFor(size)}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        glyph ? styles.glyph : styles.chip,
        !glyph && ring && styles.ring,
        style,
      ]}
    >
      <SymbolView
        name="camera.fill"
        size={glyphSize}
        tintColor={tint}
        weight="medium"
        fallback={<Icon name="camera" size={glyphSize} color={tint} strokeWidth={2.2} />}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  chip: { backgroundColor: colors.grayButton },
  glyph: { ...shadows.raised },
  ring: { borderWidth: 2, borderColor: colors.white },
});

export default CameraChip;

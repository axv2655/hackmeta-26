import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fontWeights, layout, radius, spacing } from '@/lib/theme';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

export type ButtonVariant = 'primary' | 'secondary' | 'tinted';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  /** primary = solid blue with white text, secondary = light gray (#E9EBEE) with black text, tinted = light-blue capsule fill with blue text. */
  variant?: ButtonVariant;
  /** sm = 32pt tall (card buttons), md = 36pt (default), lg = 56pt (full-width call to action). All have 12pt corners. */
  size?: ButtonSize;
  /** Icon shown before the title, tinted to match the text. */
  icon?: IconName;
  /** Custom leading element instead of `icon`. */
  left?: ReactNode;
  disabled?: boolean;
  /**
   * Force `alignSelf: 'stretch'`. Without it the button follows its parent like any View: it hugs its
   * content inside a row, and stretches inside a column unless the column sets `alignItems`.
   * For equal-width buttons in a row pass `style={{ flex: 1 }}` instead.
   */
  fullWidth?: boolean;
  /** Light haptic on press. Default true. */
  haptic?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const VARIANTS: Record<ButtonVariant, { bg: string; fg: string }> = {
  primary: { bg: colors.blue, fg: colors.white },
  secondary: { bg: colors.buttonSecondary, fg: colors.text },
  tinted: { bg: colors.chipSelectedBg, fg: colors.chipSelectedText },
};

const SIZES: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number; lineHeight: number; icon: number }> = {
  sm: { height: 32, paddingHorizontal: spacing.md, fontSize: 15, lineHeight: 20, icon: 16 },
  md: { height: 36, paddingHorizontal: spacing.md, fontSize: 15, lineHeight: 20, icon: 18 },
  lg: { height: layout.buttonHeight, paddingHorizontal: spacing.xl, fontSize: 17, lineHeight: 22, icon: 22 },
};

/** iOS 26 Facebook text button: 12pt rounded rect in the three fills. */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  left,
  disabled = false,
  fullWidth = false,
  haptic = true,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const palette = VARIANTS[variant];
  const metrics = SIZES[size];
  const slop = Math.max(0, (layout.hitTarget - metrics.height) / 2);

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic={haptic}
      scaleTo={0.97}
      pressedOpacity={0.8}
      hitSlop={{ top: slop, bottom: slop }}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      style={[
        styles.base,
        {
          height: metrics.height,
          paddingHorizontal: metrics.paddingHorizontal,
          backgroundColor: palette.bg,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {left ?? (icon ? <Icon name={icon} size={metrics.icon} color={palette.fg} /> : null)}
      <Text
        numberOfLines={1}
        style={[styles.title, { color: palette.fg, fontSize: metrics.fontSize, lineHeight: metrics.lineHeight }]}
      >
        {title}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm - 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  fullWidth: { alignSelf: 'stretch' },
  title: {
    fontWeight: fontWeights.semibold,
    textAlign: 'center',
  },
});

export default Button;

import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout } from '@/lib/theme';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

/**
 * - 'flat'    : bare glyph (default).
 * - 'outline' : glyph inside a thin outline circle (header "more" button).
 * - 'filled'  : solid circle in `color` with the glyph knocked out in `knockoutColor`.
 *               The Messenger glyph is already a filled shape, so it renders as-is.
 */
export type IconButtonVariant = 'flat' | 'outline' | 'filled';

/** Glyphs that are already a solid filled shape and need no extra circle for the 'filled' variant. */
const SELF_FILLED: readonly IconName[] = ['messenger'];

export type IconButtonProps = {
  name: IconName;
  /** Required: icon-only buttons need a spoken name. */
  accessibilityLabel: string;
  onPress?: () => void;
  /** Glyph size. Default 24. */
  size?: number;
  /** Glyph color. Default `colors.text`. */
  color?: string;
  /** Use the filled variant of the glyph when it has one. */
  filled?: boolean;
  /** Visual treatment, see `IconButtonVariant`. Default 'flat'. Ignored when `background` is set. */
  variant?: IconButtonVariant;
  /** Circle diameter for the 'outline' / 'filled' variants. Default 28. */
  circleSize?: number;
  /** Glyph color inside a 'filled' circle. Default white. */
  knockoutColor?: string;
  /** Draw the glyph on a 36pt gray circle (old-style header buttons, close buttons on sheets). */
  background?: boolean;
  /** Circle color when `background` is on. Default `colors.grayButton`. */
  backgroundColor?: string;
  /** Circle diameter when `background` is on. Default 36. */
  backgroundSize?: number;
  /** Red count badge at the top right. 0 / undefined hides it. */
  badge?: number;
  /** Touch target edge. Default 44. */
  hitSize?: number;
  disabled?: boolean;
  /** Light haptic on press. Default false. */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Icon-only button with a 44pt touch target and press feedback. */
export function IconButton({
  name,
  accessibilityLabel,
  onPress,
  size = 24,
  color = colors.text,
  filled = false,
  variant = 'flat',
  circleSize = 28,
  knockoutColor = colors.white,
  background = false,
  backgroundColor = colors.grayButton,
  backgroundSize = 36,
  badge,
  hitSize = layout.hitTarget,
  disabled = false,
  haptic = false,
  style,
}: IconButtonProps) {
  const glyph = <Icon name={name} size={size} color={color} filled={filled} />;

  let content = glyph;
  if (background) {
    content = (
      <View
        style={[
          styles.circle,
          { width: backgroundSize, height: backgroundSize, borderRadius: backgroundSize / 2, backgroundColor },
        ]}
      >
        {glyph}
      </View>
    );
  } else if (variant === 'outline') {
    content = (
      <View
        style={[
          styles.circle,
          styles.outline,
          { width: circleSize, height: circleSize, borderRadius: circleSize / 2, borderColor: color },
        ]}
      >
        {glyph}
      </View>
    );
  } else if (variant === 'filled' && !SELF_FILLED.includes(name)) {
    content = (
      <View
        style={[
          styles.circle,
          { width: circleSize, height: circleSize, borderRadius: circleSize / 2, backgroundColor: color },
        ]}
      >
        <Icon name={name} size={size} color={knockoutColor} filled={filled} />
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic={haptic}
      scaleTo={0.92}
      pressedOpacity={0.6}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[styles.target, { width: hitSize, height: hitSize }, style]}
    >
      {content}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} allowFontScaling={false}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  target: { alignItems: 'center', justifyContent: 'center' },
  circle: { alignItems: 'center', justifyContent: 'center' },
  outline: { borderWidth: 1.75 },
  badge: {
    position: 'absolute',
    top: 3,
    right: 1,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.badgeRed,
    borderWidth: 1.5,
    borderColor: colors.white,
    pointerEvents: 'none',
  },
  badgeText: { color: colors.white, fontSize: 11, lineHeight: 13, fontWeight: '700' },
});

export default IconButton;
